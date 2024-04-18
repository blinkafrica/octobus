import { RmqContext, RmqOptions, Transport } from '@nestjs/microservices';

import { Injectable } from '@nestjs/common';

@Injectable()
export class AmqpWorker {
  getOptions(url: string, queue: string, noAck = false): RmqOptions {
    return {
      transport: Transport.RMQ,
      options: {
        urls: [url],
        queue,
        noAck,
        persistent: true,
        queueOptions: {
          durable: true,
        },
      },
    };
  }

  ackMessages(ctx: RmqContext) {
    const channel = ctx.getChannelRef();
    const message = ctx.getMessage();
    channel.ack(message);
  }
}
