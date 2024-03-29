import { AmqpModule } from './mq/amqp.module';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../db/database.module';
import { Module } from '@nestjs/common';
import caesarGatewayConfig from 'config/verification.service.config';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule.forRoot({
      envFilePath: '../.env',
      load: [caesarGatewayConfig],
      isGlobal: true,
    }),
    AmqpModule,
  ],
})
export class AppModule {}
