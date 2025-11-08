import { ModuleRef } from '@nestjs/core';
import ms from 'ms';
import { JSONCodec, JetStreamPullSubscription, JsMsg, NatsConnection, consumerOpts } from 'nats';

import { Logger } from '../../logging/logger';
import { RetryError } from '../../retry';
import { dateReviver } from '../../strings';
import { groupDecorator, handlerDecorator, parseHandlers } from '../decorators';
import { collapse } from '../handlers';

export const groupKey = Symbol.for('nats.streams');
export const handlerKey = Symbol.for('nats.streams.subscribers');

/**
 * Create a stream for all subscriptions starting with `tag`
 * @param tag the name of the stream. It must not contain anything other than a-z.
 * @param middleware optional list of middleware to run on all subscribers
 */
export const stream = groupDecorator(groupKey);
/**
 * Subscribe to an event or wildcard event under a given stream
 * @param tag the subscription topic. Not that this will be prefixed by `$stream.`
 * @param middleware middleware to run on the subscriber. Not that stream middleware are run
 * first
 */
export const subscribe = handlerDecorator(handlerKey);
/**
 * Configuration for a nats subscriber
 */
export interface NatsConfig {
  /**
   * namespace of all subscriptions in this application
   */
  namespace: string;
  /**
   * maximum number of messages this subscription should request for. Change this
   * based on how fast your subscriber can deal with messages
   */
  batch_size: number;
  /**
   * timeout before retrying the message in `ms` format(e.g. 1m, 2h)
   */
  timeout: string;
}

export class Consumers {
  private streams: Set<string> = new Set();
  private subscribers: Map<string, (...args: any[]) => Promise<void> | void> = new Map();

  /**
   * Initializes the consumers from the given module
   * @param moduleRef the module ref to extract metadata from
   */
  constructor(moduleRef: ModuleRef) {
    const handlers = parseHandlers(moduleRef, groupKey, handlerKey);
    handlers.forEach(({ handler_tag, group_tag, handler, group_middleware, handler_middleware }) => {
      const middleware = [...group_middleware, ...handler_middleware];
      this.streams.add(group_tag);
      this.subscribers.set(`${group_tag}.${handler_tag}`, collapse(handler, middleware));
    });
  }

  /**
   * Start the consumers. This function will connect to nats and start
   * consuming from all streams that were registered using the `stream` decorator.
   * @param {NatsConnection} nats - the nats connection to use
   * @param {Logger} logger - the logger to use for logging errors
   * @param {NatsConfig} cfg - the configuration for the consumers
   */
  async start(nats: NatsConnection, logger: Logger, cfg: NatsConfig) {
    const manager = await nats.jetstreamManager();
    const client = nats.jetstream();
    for (const stream of this.streams) {
      await manager.streams.info(stream);
    }

    for (const [topic, handler] of this.subscribers.entries()) {
      const [stream] = topic.split('.');
      const opts = consumerOpts();
      opts.ackExplicit();
      opts.ackWait(ms(cfg.timeout));
      opts.manualAck();
      opts.deliverNew();
      opts.replayInstantly();
      opts.sample(100);
      opts.filterSubject(topic);
      opts.durable(durableName(stream, cfg.namespace, topic));

      const sub = await client.pullSubscribe(topic, opts);
      const done = pullSmart(cfg.batch_size, sub);
      runSub(sub, wrapHandler(topic, logger, handler), done);

      // first pull 😁
      sub.pull({ batch: cfg.batch_size });
    }
  }
}

/**
 * Returns a name that is safe to use as a durable name in NATS.
 * It replaces the following characters with their corresponding values:
 * - . with _
 * - * with opts
 * - > with spread
 * @param stream the name of the stream
 * @param namespace the namespace to use
 * @param topic the topic to use
 * @returns a safe durable name
 */
export function durableName(stream: string, namespace: string, topic: string) {
  const invalidChars = { '.': '_', '*': 'opts', '>': 'spread' };
  const safeTopic = topic.replace(/[\.\*\>]/g, c => invalidChars[c]);
  return `${stream}_${namespace}_${safeTopic}`;
}

/**
 * Runs a subscriber and handles acking and retrying of messages.
 * The function will for await on messages from the subscriber and
 * call the handler with the message. If the handler returns a promise
 * that resolves without an error, the message is acked and the done
 * callback is called. If the handler returns a promise that rejects
 * with a RetryError, the message is retried according to the retry
 * policy of the subscriber. If the handler returns a promise that rejects
 * with any other error, the message is acked and the done callback is
 * called.
 *
 * @param sub the subscriber to run
 * @param handler the handler to call with the message
 * @param done the callback to call when a message has been acked
 */
async function runSub(
  sub: JetStreamPullSubscription,
  handler: (...args: any[]) => Promise<void> | void,
  done: (...args: any[]) => Promise<void> | void
) {
  for await (const event of sub) {
    try {
      await handler(event);
      event.ack();
      done();
    } catch (err) {
      if (!(err instanceof RetryError)) {
        event.ack();
        done();
      }
    }
  }
}

/**
 * Returns a function that will pull messages from the subscriber in batches
 * of the specified size. Every time the returned function is called, it
 * will increment a counter. If the counter reaches the batch size, it will
 * call pull on the subscriber with the batch size and reset the counter.
 * This allows you to process messages in batches without having to worry
 * about calling pull on the subscriber too frequently.
 * @param batch the number of messages to pull in each batch
 * @param sub the subscriber to pull from
 * @returns a function that calls pull on the subscriber with the batch size
 */
function pullSmart(batch: number, sub: JetStreamPullSubscription) {
  let count = 0;
  return () => {
    count++;
    if (count === batch) {
      count = 0;
      sub.pull({ batch }); // do this asynchronously so it doesn't interfere with sub
    }
  };
}

/**
 * Wraps a handler with logging and error handling.
 * The wrapped handler will first log the incoming message to the logger using the topic
 * as the label. Then it will call the handler with the decoded message. If the handler throws
 * an exception, it will log the error to the logger and re-throw the error.
 * @param topic the topic to use as the label when logging messages
 * @param logger the logger to use for logging messages
 * @param handler the handler to wrap
 * @returns the wrapped handler
 */
function wrapHandler(topic: string, logger: Logger, handler: (...args: any[]) => Promise<void> | void) {
  const childLogger = logger.child({ topic });
  const codec = JSONCodec(dateReviver);

  return async function (msg: JsMsg) {
    const data = codec.decode(msg.data);
    childLogger.log({ data, subject: msg.subject });
    try {
      await handler(data);
    } catch (err) {
      childLogger.error(err, { data, subject: msg.subject });
      throw err;
    }
  };
}
