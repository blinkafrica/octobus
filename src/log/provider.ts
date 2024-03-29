import { Logger, LoggerConfig } from './logger';

import { Provider } from '@nestjs/common';
import { defaultSerializers } from './serializers';

export const BunyanLogger: (
  name: string,
  serializers?: string
) => Provider<Logger> = (name: string, serializers: string = '') => ({
  provide: Logger,
  useFactory: () => {
    // You can provide a default configuration here or load it from a configuration file
    const config: LoggerConfig = {
      name,
      serializers: defaultSerializers(serializers),
    };

    return new Logger(config);
  },
});
