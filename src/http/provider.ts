import { AgentConfig, HttpAgent } from './agent';

import { BuLogger } from '../log/logger';
import { Provider } from '@nestjs/common';
import { dateReviver } from '../internals/strings';
import { defaultSerializers } from '../log/serializers';
import verificationServiceConfig from 'config/verification.service.config';

export const HttpProvider: (name: string) => Provider<HttpAgent> = (
  name: string
) => ({
  provide: HttpAgent,
  useFactory: () => {
    const HTTPAgentConfig: AgentConfig = {
      service: name,
      scheme: verificationServiceConfig().app_name,
      logger: new BuLogger({
        name,
        serializers: defaultSerializers(),
      }).child({ service: 'axios' }),
    };
    return new HttpAgent(HTTPAgentConfig, {
      transformResponse: [
        (data) => {
          if (data === '') {
            return {};
          }

          return JSON.parse(data, dateReviver);
        },
      ],
    });
  },
});

export const InitHttpAgent: (name: string) => HttpAgent = (name: string) => {
  const HTTPAgentConfig: AgentConfig = {
    service: name,
    scheme: verificationServiceConfig().app_name,
    logger: new BuLogger({
      name,
      serializers: defaultSerializers('data.image'),
    }).child({ service: 'axios' }),
  };
  return new HttpAgent(HTTPAgentConfig, {
    transformResponse: [
      (data) => {
        if (data === '') {
          return {};
        }

        return JSON.parse(data, dateReviver);
      },
    ],
  });
};
