import { ClientsModule, Transport } from '@nestjs/microservices';
import { DynamicModule, Module } from '@nestjs/common';

import { AmqpWorker } from './worker';
import { ConfigService } from '@nestjs/config';

export interface AmqpModuleOptions {
  name: string;
  url: string;
}
@Module({
  providers: [AmqpWorker],
  exports: [AmqpWorker],
})
export class AmqpModule {
  static queue({ name, url }: AmqpModuleOptions): DynamicModule {
    return {
      module: AmqpModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name,
            useFactory: () => ({
              transport: Transport.RMQ,
              options: {
                urls: [url],
                queue: name,
              },
            }),
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
