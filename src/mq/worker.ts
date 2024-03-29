import { RmqOptions, Transport } from '@nestjs/microservices';

import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AmqpWorker {
  constructor(private readonly config: ConfigService) {}
  getOptions(queue: string, noAck = false): RmqOptions {
    console.log('🚀 ~ AmqpWorker ~ getOptions ~ queue:', queue);
    return {
      transport: Transport.RMQ,
      options: {
        urls: [this.config.getOrThrow<string>('amqp.url')],
        queue: this.config.getOrThrow(`BLINK_MQ_${queue}_QUEUE`),
        noAck,
        persistent: true,
        queueOptions: {
          durable: true,
        },
      },
    };
  }
}
