import AmqpWorker from './mq/worker';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import requestIp from 'request-ip';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const amqp = app.get<AmqpWorker>(AmqpWorker);
  const config = app.get(ConfigService);
  // Request Validation
  app.setGlobalPrefix('api/v1');
  app.use(requestIp.mw());
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://cardsuccess-getblink.netlify.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });
  // Helmet Middleware against known security vulnerabilities
  app.use(helmet());

  app.connectMicroservice<MicroserviceOptions>(
    amqp.getOptions(config.getOrThrow('amqp.verification_queue')),
  );
  app.startAllMicroservices();
  await app.listen(config.get<number>('port') || 9876, '0.0.0.0', () => {
    Logger.log(
      `Server 🚀 is running on on port ${config.get<number>('port') || 3000}`,
      'VERIFICATION SERVICE',
    );
  });
}
bootstrap();
