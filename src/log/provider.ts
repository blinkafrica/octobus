import { Provider } from '@nestjs/common';
import { BuLogger, LoggerConfig } from './logger';
import { defaultSerializers } from './serializers';

export const BunyanLogger: (
  name: string,
  serializers?: string,
) => Provider<BuLogger> = (name: string, serializers: string = '') => ({
  provide: BuLogger,
  useFactory: () => {
    // You can provide a default configuration here or load it from a configuration file
    const config: LoggerConfig = {
      name,
      serializers: defaultSerializers(serializers),
    };

    return new BuLogger(config);
  },
});
