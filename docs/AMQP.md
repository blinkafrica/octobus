# AMQP Module Documentation

This document provides comprehensive guidance on using the AMQP module for RabbitMQ integration in your NestJS application.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Basic Setup](#basic-setup)
- [Configuration](#configuration)
  - [Global Configuration](#global-configuration)
  - [Queue Registration](#queue-registration)
- [Usage Examples](#usage-examples)
  - [Setting Up Producers](#setting-up-producers)
  - [Setting Up Consumers](#setting-up-consumers)
  - [Using AmqpWorker](#using-amqpworker)
- [API Reference](#api-reference)
- [Advanced Usage](#advanced-usage)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

The AMQP module provides a simplified interface for working with RabbitMQ in NestJS applications. It supports:

- Global URL configuration (set once, use everywhere)
- Multiple queue connections
- Producer and consumer patterns
- Message acknowledgment handling
- Durable queues with persistent messages

## Installation

The AMQP module is part of this codebase and uses the following dependencies:

```bash
npm install @nestjs/microservices amqplib
```

## Basic Setup

### 1. Import the Module in Your Root Module

In your `app.module.ts` or main application module:

```typescript
import { Module } from '@nestjs/common';
import { AmqpModule } from './mq/amqp';

@Module({
  imports: [
    // Configure the global AMQP URL once
    AmqpModule.forRoot({
      url: process.env.AMQP_URL || 'amqp://localhost:5672'
    })

    // Other imports...
  ]
})
export class AppModule {}
```

### 2. Register Queues in Feature Modules

In any feature module where you need queue access:

```typescript
import { Module } from '@nestjs/common';
import { AmqpModule } from './mq/amqp';

@Module({
  imports: [
    // No need to pass URL again - uses global config
    AmqpModule.queue({
      name: Symbol('VERIFY_TRANSACTION_QUEUE'),
      queue: 'verify-transaction'
    })
  ],
  controllers: [TransactionController],
  providers: [TransactionService]
})
export class TransactionModule {}
```

---

## Configuration

### Global Configuration

#### `AmqpModule.forRoot(options)`

Call this **once** in your root module to set the global AMQP URL.

**Parameters:**

| Property | Type   | Required | Description         |
| -------- | ------ | -------- | ------------------- |
| `url`    | string | Yes      | AMQP connection URL |

**Example:**

```typescript
AmqpModule.forRoot({
  url: 'amqp://user:password@localhost:5672/vhost'
});
```

**Environment-based Configuration:**

```typescript
AmqpModule.forRoot({
  url: process.env.RABBITMQ_URL
});
```

### Queue Registration

#### `AmqpModule.queue(options)`

Register a queue connection for producing or consuming messages.

**Parameters:**

| Property | Type    | Required | Default | Description                                 |
| -------- | ------- | -------- | ------- | ------------------------------------------- |
| `name`   | symbol  | Yes      | -       | Unique identifier for the queue client      |
| `queue`  | string  | Yes      | -       | Name of the RabbitMQ queue                  |
| `url`    | string  | No       | Global  | AMQP URL (overrides global if provided)     |
| `noAck`  | boolean | No       | false   | Auto-acknowledge messages (not recommended) |

**Example:**

```typescript
AmqpModule.queue({
  name: Symbol('USER_EVENTS'),
  queue: 'user-events',
  noAck: false // Require manual acknowledgment
});
```

---

## Usage Examples

### Setting Up Producers

Producers send messages to queues.

#### 1. Define Queue Symbol

Create a constants file for your queue identifiers:

```typescript
// constants/queues.ts
export const QUEUE_TOKENS = {
  VERIFY_TRANSACTION: Symbol('VERIFY_TRANSACTION_QUEUE'),
  SEND_EMAIL: Symbol('SEND_EMAIL_QUEUE'),
  PROCESS_PAYMENT: Symbol('PROCESS_PAYMENT_QUEUE')
} as const;
```

#### 2. Register Queue in Module

```typescript
import { Module } from '@nestjs/common';
import { AmqpModule } from './mq/amqp';
import { QUEUE_TOKENS } from './constants/queues';

@Module({
  imports: [
    AmqpModule.queue({
      name: QUEUE_TOKENS.VERIFY_TRANSACTION,
      queue: 'verify-transaction'
    })
  ],
  providers: [TransactionService]
})
export class TransactionModule {}
```

#### 3. Inject and Use in Service

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { QUEUE_TOKENS } from './constants/queues';

@Injectable()
export class TransactionService {
  constructor(
    @Inject(QUEUE_TOKENS.VERIFY_TRANSACTION)
    private readonly verifyQueue: ClientProxy
  ) {}

  async verifyTransaction(transactionId: string) {
    // Send message to queue
    const pattern = { cmd: 'verify' };
    const payload = { transactionId, timestamp: Date.now() };

    // Emit (fire and forget)
    this.verifyQueue.emit(pattern, payload);

    // OR send and wait for response
    const result = await this.verifyQueue.send(pattern, payload).toPromise();
    return result;
  }
}
```

### Setting Up Consumers

Consumers listen to queues and process messages.

#### 1. Create Microservice Bootstrap

Create a separate microservice entry point:

```typescript
// src/microservices/transaction-verifier.ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from '../app.module';
import { AmqpWorker } from '../mq/amqp';

async function bootstrap() {
  const amqpWorker = new AmqpWorker();

  // Uses global URL configured via AmqpModule.forRoot()
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    amqpWorker.getOptions('verify-transaction', false)
  );

  await app.listen();
  console.log('Transaction verifier microservice is listening');
}

bootstrap();
```

#### 2. Create Message Handler

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Ctx, Payload, RmqContext } from '@nestjs/microservices';
import { AmqpWorker } from '../mq/amqp';

@Controller()
export class TransactionVerifierController {
  constructor(private readonly amqpWorker: AmqpWorker) {}

  @MessagePattern({ cmd: 'verify' })
  async handleVerifyTransaction(@Payload() data: any, @Ctx() context: RmqContext) {
    console.log('Received transaction:', data);

    try {
      // Process the transaction
      const result = await this.processTransaction(data.transactionId);

      // Acknowledge the message
      this.amqpWorker.ackMessages(context);

      return { success: true, result };
    } catch (error) {
      console.error('Error processing transaction:', error);
      // Optionally, you can reject/nack the message here
      throw error;
    }
  }

  private async processTransaction(transactionId: string) {
    // Your business logic here
    return { verified: true };
  }
}
```

#### 3. Alternative: Using Decorators

Create a custom message handler decorator:

```typescript
import { Injectable } from '@nestjs/common';
import { EventPattern, Ctx, Payload, RmqContext } from '@nestjs/microservices';
import { AmqpWorker } from '../mq/amqp';

@Injectable()
export class EmailService {
  constructor(private readonly amqpWorker: AmqpWorker) {}

  @EventPattern('send-email')
  async handleSendEmail(@Payload() data: { to: string; subject: string; body: string }, @Ctx() context: RmqContext) {
    try {
      await this.sendEmail(data);
      this.amqpWorker.ackMessages(context);
    } catch (error) {
      console.error('Failed to send email:', error);
      // Don't ack - message will be redelivered
    }
  }

  private async sendEmail(data: any) {
    // Email sending logic
  }
}
```

### Using AmqpWorker

The `AmqpWorker` service provides utility methods for working with RabbitMQ.

#### Creating Microservice with Global URL

```typescript
import { AmqpWorker } from './mq/amqp';

const amqpWorker = new AmqpWorker();

// Uses global URL configured via AmqpModule.forRoot()
const options = amqpWorker.getOptions('my-queue');

const app = await NestFactory.createMicroservice(AppModule, options);
```

#### Creating Microservice with Custom URL

```typescript
const amqpWorker = new AmqpWorker();

// Override global URL for this specific microservice
const options = amqpWorker.getOptions(
  'amqp://different-server:5672',
  'special-queue',
  false // noAck
);

const app = await NestFactory.createMicroservice(AppModule, options);
```

#### Acknowledging Messages

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Ctx, RmqContext } from '@nestjs/microservices';
import { AmqpWorker } from './mq/amqp';

@Controller()
export class MyController {
  constructor(private readonly amqpWorker: AmqpWorker) {}

  @MessagePattern('my-pattern')
  async handleMessage(@Ctx() context: RmqContext) {
    // Process message...

    // Manually acknowledge
    this.amqpWorker.ackMessages(context);
  }
}
```

---

## API Reference

### AmqpModule

#### Static Methods

##### `forRoot(options: AmqpModuleRootOptions): DynamicModule`

Configures the global AMQP connection URL. Call once in your root module.

**Parameters:**

- `options.url` (string): AMQP connection URL

**Returns:** NestJS DynamicModule

**Example:**

```typescript
AmqpModule.forRoot({ url: 'amqp://localhost:5672' });
```

---

##### `queue(options: AmqpModuleQueueOptions): DynamicModule`

Registers a queue for producing or consuming messages.

**Parameters:**

- `options.name` (symbol): Unique identifier for the queue client
- `options.queue` (string): Queue name
- `options.url` (string, optional): Override global URL
- `options.noAck` (boolean, optional, default: false): Auto-acknowledge messages

**Returns:** NestJS DynamicModule

**Example:**

```typescript
AmqpModule.queue({
  name: Symbol('MY_QUEUE'),
  queue: 'my-queue-name'
});
```

---

##### `getGlobalUrl(): string | undefined`

Returns the globally configured AMQP URL.

**Returns:** The global URL or undefined if not set

---

### AmqpWorker

#### Methods

##### `getOptions(queue: string, noAck?: boolean): RmqOptions`

Creates RabbitMQ options using the global URL.

**Parameters:**

- `queue` (string): Queue name
- `noAck` (boolean, optional, default: false): Auto-acknowledge

**Returns:** RmqOptions for microservice configuration

**Throws:** Error if global URL is not configured

**Example:**

```typescript
const options = amqpWorker.getOptions('my-queue', false);
```

---

##### `getOptions(url: string, queue: string, noAck?: boolean): RmqOptions`

Creates RabbitMQ options with a custom URL.

**Parameters:**

- `url` (string): AMQP connection URL
- `queue` (string): Queue name
- `noAck` (boolean, optional, default: false): Auto-acknowledge

**Returns:** RmqOptions for microservice configuration

**Example:**

```typescript
const options = amqpWorker.getOptions('amqp://custom-server:5672', 'my-queue', false);
```

---

##### `ackMessages(context: RmqContext): void`

Manually acknowledges a message from RabbitMQ.

**Parameters:**

- `context` (RmqContext): The RabbitMQ context from the message handler

**Example:**

```typescript
this.amqpWorker.ackMessages(context);
```

---

## Advanced Usage

### Multiple Queue Connections

You can register multiple queues in a single module:

```typescript
@Module({
  imports: [
    AmqpModule.queue({
      name: Symbol('QUEUE_A'),
      queue: 'queue-a'
    }),
    AmqpModule.queue({
      name: Symbol('QUEUE_B'),
      queue: 'queue-b'
    }),
    AmqpModule.queue({
      name: Symbol('QUEUE_C'),
      queue: 'queue-c'
    })
  ]
})
export class MultiQueueModule {}
```

### Per-Queue URL Override

Override the global URL for specific queues:

```typescript
@Module({
  imports: [
    AmqpModule.forRoot({ url: 'amqp://primary-server:5672' }),

    // Uses global URL
    AmqpModule.queue({
      name: Symbol('MAIN_QUEUE'),
      queue: 'main-queue'
    }),

    // Uses different server
    AmqpModule.queue({
      name: Symbol('BACKUP_QUEUE'),
      queue: 'backup-queue',
      url: 'amqp://backup-server:5672'
    })
  ]
})
export class HybridModule {}
```

### Hybrid Application (HTTP + Microservice)

Run both HTTP and microservice in the same application:

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { AmqpWorker } from './mq/amqp';

async function bootstrap() {
  // Create HTTP application
  const app = await NestFactory.create(AppModule);

  // Add microservice
  const amqpWorker = new AmqpWorker();
  app.connectMicroservice<MicroserviceOptions>(amqpWorker.getOptions('my-queue'));

  await app.startAllMicroservices();
  await app.listen(3000);

  console.log('HTTP server running on port 3000');
  console.log('Microservice listening to my-queue');
}

bootstrap();
```

---

## Best Practices

### 1. Use Symbols for Queue Names

Always use symbols for queue identifiers to avoid naming conflicts:

```typescript
// ✅ Good
const QUEUE_NAME = Symbol('MY_QUEUE');

// ❌ Bad
const QUEUE_NAME = 'MY_QUEUE'; // String can conflict
```

### 2. Always Manually Acknowledge Messages

Set `noAck: false` and manually acknowledge messages after processing:

```typescript
AmqpModule.queue({
  name: Symbol('MY_QUEUE'),
  queue: 'my-queue',
  noAck: false // ✅ Explicit manual acknowledgment
});
```

### 3. Centralize Queue Configuration

Keep all queue configurations in a central location:

```typescript
// config/queues.ts
export const QUEUES = {
  VERIFY_TRANSACTION: {
    name: Symbol('VERIFY_TRANSACTION'),
    queue: 'verify-transaction'
  },
  SEND_EMAIL: {
    name: Symbol('SEND_EMAIL'),
    queue: 'send-email'
  }
} as const;
```

### 4. Use Environment Variables

Never hardcode AMQP URLs:

```typescript
// ✅ Good
AmqpModule.forRoot({ url: process.env.RABBITMQ_URL });

// ❌ Bad
AmqpModule.forRoot({ url: 'amqp://localhost:5672' });
```

### 5. Handle Errors Gracefully

Always wrap message processing in try-catch:

```typescript
@MessagePattern('my-pattern')
async handle(@Payload() data: any, @Ctx() context: RmqContext) {
  try {
    await this.process(data);
    this.amqpWorker.ackMessages(context);
  } catch (error) {
    console.error('Processing failed:', error);
    // Don't ack - message will be requeued
  }
}
```

### 6. Use Separate Microservices for Heavy Processing

Don't mix heavy message processing with HTTP endpoints in the same process.

### 7. Monitor Queue Depth

Regularly monitor your queue depths to detect processing bottlenecks.

---

## Troubleshooting

### Error: "AMQP URL is required"

**Problem:** Global URL not configured before using queues.

**Solution:** Call `AmqpModule.forRoot()` in your root module before any `AmqpModule.queue()` calls:

```typescript
@Module({
  imports: [
    AmqpModule.forRoot({ url: process.env.AMQP_URL }), // Must be first
    AmqpModule.queue({ ... }),
  ],
})
```

### Messages Not Being Consumed

**Possible causes:**

1. Microservice not started
2. Queue name mismatch
3. Connection issues

**Debug steps:**

```typescript
// Add logging
const options = amqpWorker.getOptions('my-queue');
console.log('Connecting to:', options);
```

### Messages Being Redelivered Repeatedly

**Problem:** Messages not being acknowledged.

**Solution:** Ensure you call `amqpWorker.ackMessages(context)` after successful processing:

```typescript
@MessagePattern('my-pattern')
async handle(@Ctx() context: RmqContext) {
  // Process...
  this.amqpWorker.ackMessages(context); // ✅ Don't forget this!
}
```

### Circular Dependency Warning

The circular dependency between `AmqpModule` and `AmqpWorker` is intentional and safe. It only involves static method calls at runtime, not during module initialization.

### Connection Refused

**Problem:** Cannot connect to RabbitMQ server.

**Solutions:**

1. Verify RabbitMQ is running: `rabbitmq-server`
2. Check connection URL format: `amqp://user:pass@host:port/vhost`
3. Verify network access and firewall rules
4. Check RabbitMQ logs for errors

---

## Additional Resources

- [NestJS Microservices Documentation](https://docs.nestjs.com/microservices/basics)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/getstarted.html)
- [AMQP 0-9-1 Protocol](https://www.rabbitmq.com/protocol.html)

---

**Last Updated:** November 9, 2025
