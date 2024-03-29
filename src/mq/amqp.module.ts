import { ClientsModule, Transport } from '@nestjs/microservices';
import { DynamicModule, Module } from '@nestjs/common';

import { AmqpWorker } from './worker';
import { ConfigService } from '@nestjs/config';

export interface AmqpModuleOptions {
  name: string;
}
@Module({
  providers: [AmqpWorker],
  exports: [AmqpWorker],
})
export class AmqpModule {
  static queue({ name }: AmqpModuleOptions): DynamicModule {
    return {
      module: AmqpModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name,
            useFactory: (config: ConfigService) => ({
              transport: Transport.RMQ,
              options: {
                urls: [config.getOrThrow<string>('amqp.url')],
                queue: config.getOrThrow(
                  `BLINK_MQ_${name.toUpperCase()}_QUEUE`
                ),
              },
            }),
            inject: [ConfigService],
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
