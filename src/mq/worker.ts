import { RmqContext, RmqOptions, Transport } from '@nestjs/microservices';

import { AmqpModule } from './amqp.module';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AmqpWorker {
  /**
   * Return a RmqOptions object that can be used to create an RMQ Microservice.
   * If the second parameter is a string, it is assumed to be the queue name and the third parameter is the noAck value.
   * If the second parameter is a boolean, it is assumed to be the noAck value and the first parameter is the queue name.
   * The global AMQP URL can be set using AmqpModule.forRoot() and will be used if the url parameter is not provided.
   * If the url parameter is not provided and the global AMQP URL has not been set, an error will be thrown.
   */
  getOptions(queue: string, noAck?: boolean): RmqOptions;
  getOptions(url: string, queue: string, noAck?: boolean): RmqOptions;
  getOptions(urlOrQueue: string, queueOrNoAck?: string | boolean, noAck = false): RmqOptions {
    let url: string;
    let queue: string;
    let noAckValue: boolean;

    if (typeof queueOrNoAck === 'string') {
      url = urlOrQueue;
      queue = queueOrNoAck;
      noAckValue = noAck;
    } else {
      queue = urlOrQueue;
      noAckValue = queueOrNoAck ?? false;
      url = AmqpModule.getGlobalUrl();

      if (!url) {
        throw new Error(
          'AMQP URL is required. Either provide it as a parameter or configure it globally using AmqpModule.forRoot()'
        );
      }
    }

    return {
      transport: Transport.RMQ,
      options: {
        urls: [url],
        queue,
        noAck: noAckValue,
        persistent: true,
        queueOptions: {
          durable: true
        }
      }
    };
  }

  ackMessages(ctx: RmqContext) {
    const channel = ctx.getChannelRef();
    const message = ctx.getMessage();
    channel.ack(message);
  }
}
