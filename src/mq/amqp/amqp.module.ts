import { DynamicModule, Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { AmqpWorker } from './worker';

export interface AmqpModuleRootOptions {
  url: string;
}

export interface AmqpModuleQueueOptions {
  name: symbol;
  queue: string;
  url?: string; // Optional now, falls back to global config
  noAck?: boolean;
}

@Global()
@Module({ providers: [AmqpWorker], exports: [AmqpWorker] })
export class AmqpModule {
  private static globalUrl: string;

  /**
   * Get the global AMQP URL
   */
  static getGlobalUrl(): string | undefined {
    return AmqpModule.globalUrl;
  }

  /**
   * Configure the AMQP module with global settings (call once in your root module)
   */
  static forRoot(options: AmqpModuleRootOptions): DynamicModule {
    AmqpModule.globalUrl = options.url;
    return {
      module: AmqpModule,
      global: true
    };
  }

  /**
   * Configure an AMQP client to connect to a queue.
   * @param {AmqpModuleQueueOptions} options
   * @param {symbol} options.name - name of the client
   * @param {string} options.queue - name of the queue to connect to
   * @param {string} [options.url] - URL of the AMQP server to connect to.
   * If not provided, falls back to the global URL configured using AmqpModule.forRoot()
   * @param {boolean} [options.noAck=false] - whether to acknowledge messages or not
   * @returns {DynamicModule}
   */
  static queue(options: AmqpModuleQueueOptions): DynamicModule {
    const url = options.url ?? AmqpModule.globalUrl;

    if (!url) {
      throw new Error(
        'AMQP URL is required. Either provide it in queue() options or configure it globally using AmqpModule.forRoot()'
      );
    }

    return {
      module: AmqpModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: options.name,
            useFactory: () => ({
              transport: Transport.RMQ,
              options: {
                urls: [url],
                queue: options.queue,
                persistent: true,
                queueOptions: {
                  durable: true
                }
              }
            })
          }
        ])
      ],
      exports: [ClientsModule]
    };
  }
}
