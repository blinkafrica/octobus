# NATS JetStream Consumer Documentation

This document provides comprehensive guidance on using the NATS JetStream consumer implementation for event-driven architectures in your NestJS application.

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Installation](#installation)
- [Architecture](#architecture)
- [Stream Factory](#stream-factory)
  - [Creating Streams](#creating-streams)
  - [Stream Types](#stream-types)
- [Consumers](#consumers)
  - [Defining Streams](#defining-streams)
  - [Subscribing to Events](#subscribing-to-events)
  - [Consumer Configuration](#consumer-configuration)
- [Publishing Events](#publishing-events)
- [Complete Examples](#complete-examples)
- [Middleware](#middleware)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

This NATS JetStream implementation provides a robust, decorator-based approach to building event-driven systems with:

- **Stream Management**: Automatic creation and configuration of JetStream streams
- **Type-Safe Events**: Full TypeScript support for event payloads
- **Decorator-Based Consumers**: Clean, declarative consumer definitions
- **Middleware Support**: Stream-level and subscriber-level middleware
- **Automatic Retry**: Built-in retry mechanisms with configurable timeouts
- **At-Least-Once Delivery**: Message acknowledgment and redelivery
- **Dual Stream Types**: Support for both broadcast and log-based streams

---

## Core Concepts

### Streams

A **stream** is a named collection of messages stored in JetStream. Streams define:

- Message retention policies
- Storage type (memory or file)
- Subject patterns (topics)

### Subjects

A **subject** is a topic under which messages are published. Subjects follow a hierarchical pattern:

```
stream_name.subject.path
```

For example:

- `user.created`
- `transaction.verified`
- `notification.email.sent`

### Consumers

A **consumer** is a durable subscription to a stream that processes messages. Consumers:

- Track their position in the stream
- Support at-least-once delivery
- Can filter by subject patterns
- Handle acknowledgments and retries

---

## Installation

Install the required dependencies:

```bash
npm install nats ms uuid
npm install -D @types/uuid
```

---

## Architecture

### Component Overview

```
┌─────────────────┐
│  StreamFactory  │  ← Creates and manages streams
└────────┬────────┘
         │
         ├─→ Stream<T>  ← Publishes events
         │
         └─→ Consumers  ← Subscribes to and processes events
```

---

## Stream Factory

The `StreamFactory` is responsible for creating and managing NATS JetStream streams.

### Initialization

#### Using a Connection URL

```typescript
import { StreamFactory } from './mq/nats/factory';

// Single server
const factory = await StreamFactory.init('nats://localhost:4222');

// Multiple servers (comma-separated)
const factory = await StreamFactory.init('nats://server1:4222,nats://server2:4222');

// Multiple servers (array)
const factory = await StreamFactory.init(['nats://server1:4222', 'nats://server2:4222']);

// With options
const factory = await StreamFactory.init('nats://localhost:4222', {
  name: 'my-app',
  maxReconnectAttempts: 10,
  reconnectTimeWait: 1000
});
```

#### Using an Existing Connection

```typescript
import { connect } from 'nats';

const conn = await connect({ servers: 'nats://localhost:4222' });
const factory = await StreamFactory.init(conn);
```

### Creating Streams

#### Stream Types

The implementation supports two types of streams:

##### 1. Broadcast Streams

Broadcast streams are designed for real-time event distribution with limited buffering.

**Use Cases:**

- Real-time notifications
- Live updates
- Event broadcasting to multiple consumers

**Configuration:**

```typescript
const userEvents = await factory.broadcastStream('user', 100);
// or
const userEvents = await factory.stream('user', {
  stream_type: 'broadcast',
  buffer_size: 100 // Maximum messages to buffer
});
```

**Characteristics:**

- Uses memory storage (fast)
- Limited message retention
- Discards old messages when buffer is full
- Ideal for ephemeral events

##### 2. Log Streams

Log streams are designed for durable event storage with time-based retention.

**Use Cases:**

- Event sourcing
- Audit logs
- Historical data analysis
- Message replay

**Configuration:**

```typescript
const transactionLogs = await factory.logStream('transaction', '7d');
// or
const transactionLogs = await factory.stream('transaction', {
  stream_type: 'log',
  retention_period: '7d' // Keep messages for 7 days
});
```

**Characteristics:**

- Uses file storage (persistent)
- Time-based retention
- Survives server restarts
- Supports message replay

**Retention Period Formats:**

- `'1h'` - 1 hour
- `'24h'` or `'1d'` - 1 day
- `'7d'` - 7 days
- `'30d'` - 30 days
- `'1y'` - 1 year

### Example: Setting Up Streams in NestJS

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { StreamFactory } from './mq/nats/factory';
import { Stream } from './mq/nats/stream';

@Module({})
export class AppModule implements OnModuleInit {
  private factory: StreamFactory;
  public userStream: Stream<UserEvent>;
  public transactionStream: Stream<TransactionEvent>;

  async onModuleInit() {
    // Initialize factory
    this.factory = await StreamFactory.init(process.env.NATS_URL);

    // Create streams
    this.userStream = await this.factory.broadcastStream('user', 100);
    this.transactionStream = await this.factory.logStream('transaction', '30d');
  }

  async onModuleDestroy() {
    // Only needed if factory manages the connection
    await this.factory.stop();
  }
}
```

---

## Consumers

Consumers process events from streams using decorators.

### Defining Streams

Use the `@stream()` decorator to define a stream group:

```typescript
import { Injectable } from '@nestjs/common';
import { stream, subscribe } from './mq/nats/consumer';

@Injectable()
@stream('user') // Stream name
export class UserEventConsumer {
  // Subscribers go here
}
```

### Subscribing to Events

Use the `@subscribe()` decorator to define event handlers:

```typescript
import { Injectable } from '@nestjs/common';
import { stream, subscribe } from './mq/nats/consumer';

interface UserCreatedEvent {
  userId: string;
  email: string;
  createdAt: Date;
}

@Injectable()
@stream('user')
export class UserEventConsumer {
  @subscribe('created')
  async handleUserCreated(event: UserCreatedEvent) {
    console.log('New user created:', event.userId);
    // Process the event
    await this.sendWelcomeEmail(event.email);
  }

  @subscribe('updated')
  async handleUserUpdated(event: { userId: string; changes: any }) {
    console.log('User updated:', event.userId);
    // Process the event
  }

  @subscribe('deleted')
  async handleUserDeleted(event: { userId: string }) {
    console.log('User deleted:', event.userId);
    // Cleanup logic
  }

  private async sendWelcomeEmail(email: string) {
    // Email sending logic
  }
}
```

### Wildcard Subscriptions

NATS supports wildcard patterns in subjects:

```typescript
@Injectable()
@stream('notification')
export class NotificationConsumer {
  // Matches: notification.email.sent, notification.email.failed, etc.
  @subscribe('email.*')
  async handleEmailEvents(event: any) {
    console.log('Email event:', event);
  }

  // Matches: notification.sms.sent, notification.push.sent, etc.
  @subscribe('*.sent')
  async handleAllSentEvents(event: any) {
    console.log('Sent event:', event);
  }

  // Matches any event under notification stream
  @subscribe('>')
  async handleAllEvents(event: any) {
    console.log('Any notification event:', event);
  }
}
```

**Wildcard Types:**

- `*` - Matches a single token (e.g., `email.*` matches `email.sent` but not `email.sent.success`)
- `>` - Matches one or more tokens (e.g., `email.>` matches `email.sent` and `email.sent.success`)

### Consumer Configuration

Configure consumers using the `NatsConfig` interface:

```typescript
import { Consumers, NatsConfig } from './mq/nats/consumer';
import { Logger } from './logging/logger';
import { connect } from 'nats';

const config: NatsConfig = {
  namespace: 'my-app', // Application namespace
  batch_size: 10, // Messages to fetch per batch
  timeout: '30s' // Ack timeout before retry
};

// Create consumers from your module
const consumers = new Consumers(moduleRef);

// Connect to NATS
const nats = await connect({ servers: process.env.NATS_URL });

// Start consuming
await consumers.start(nats, logger, config);
```

**Configuration Options:**

| Property     | Type   | Description                                            |
| ------------ | ------ | ------------------------------------------------------ |
| `namespace`  | string | Unique identifier for this application/service         |
| `batch_size` | number | Number of messages to fetch in each batch (1-1000)     |
| `timeout`    | string | Time to wait for ack before redelivering (e.g., '30s') |

**Timeout Formats:**

- `'1s'` - 1 second
- `'30s'` - 30 seconds
- `'1m'` - 1 minute
- `'5m'` - 5 minutes
- `'1h'` - 1 hour

### Complete Consumer Setup Example

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { connect } from 'nats';
import { Consumers } from './mq/nats/consumer';
import { Logger } from './logging/logger';
import { UserEventConsumer } from './consumers/user.consumer';
import { TransactionConsumer } from './consumers/transaction.consumer';

@Module({
  providers: [UserEventConsumer, TransactionConsumer, Logger]
})
export class ConsumerModule implements OnModuleInit {
  constructor(
    private moduleRef: ModuleRef,
    private logger: Logger
  ) {}

  async onModuleInit() {
    // Initialize consumers
    const consumers = new Consumers(this.moduleRef);

    // Connect to NATS
    const nats = await connect({
      servers: process.env.NATS_URL,
      name: 'my-app-consumer'
    });

    // Start consuming
    await consumers.start(nats, this.logger, {
      namespace: 'my-app',
      batch_size: 10,
      timeout: '30s'
    });

    this.logger.log('Consumers started successfully');
  }
}
```

---

## Publishing Events

Use the `Stream<T>` class to publish events:

```typescript
import { Injectable } from '@nestjs/common';
import { Stream } from './mq/nats/stream';

interface UserCreatedEvent {
  userId: string;
  email: string;
  createdAt: Date;
}

@Injectable()
export class UserService {
  constructor(private userStream: Stream<UserCreatedEvent>) {}

  async createUser(email: string) {
    const userId = generateId();

    // Create user in database
    await this.db.users.insert({ id: userId, email });

    // Publish event
    await this.userStream.add('created', {
      userId,
      email,
      createdAt: new Date()
    });

    return userId;
  }
}
```

### Subject Paths

The subject path determines the full topic:

```typescript
// Stream name: 'user'
// Path: 'created'
// Full subject: 'user.created'
await userStream.add('created', event);

// Stream name: 'notification'
// Path: 'email.sent'
// Full subject: 'notification.email.sent'
await notificationStream.add('email.sent', event);
```

---

## Complete Examples

### Example 1: User Registration Flow

#### 1. Define Event Types

```typescript
// events/user.events.ts
export interface UserCreatedEvent {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface UserVerifiedEvent {
  userId: string;
  verifiedAt: Date;
}
```

#### 2. Set Up Stream

```typescript
// app.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { StreamFactory } from './mq/nats/factory';
import { Stream } from './mq/nats/stream';
import { UserCreatedEvent } from './events/user.events';

@Module({
  providers: [UserService, UserEventConsumer]
})
export class AppModule implements OnModuleInit {
  public userStream: Stream<UserCreatedEvent>;

  async onModuleInit() {
    const factory = await StreamFactory.init(process.env.NATS_URL);
    this.userStream = await factory.broadcastStream('user', 100);
  }
}
```

#### 3. Publish Events

```typescript
// services/user.service.ts
import { Injectable } from '@nestjs/common';
import { Stream } from '../mq/nats/stream';
import { UserCreatedEvent } from '../events/user.events';

@Injectable()
export class UserService {
  constructor(private userStream: Stream<UserCreatedEvent>) {}

  async register(email: string, name: string) {
    const userId = await this.createUserInDb(email, name);

    await this.userStream.add('created', {
      userId,
      email,
      name,
      createdAt: new Date()
    });

    return userId;
  }

  private async createUserInDb(email: string, name: string) {
    // Database logic
    return 'user-123';
  }
}
```

#### 4. Consume Events

```typescript
// consumers/user.consumer.ts
import { Injectable } from '@nestjs/common';
import { stream, subscribe } from '../mq/nats/consumer';
import { UserCreatedEvent } from '../events/user.events';

@Injectable()
@stream('user')
export class UserEventConsumer {
  @subscribe('created')
  async handleUserCreated(event: UserCreatedEvent) {
    console.log(`Sending welcome email to ${event.email}`);
    await this.sendWelcomeEmail(event.email);

    console.log(`Creating user profile for ${event.userId}`);
    await this.createUserProfile(event.userId);
  }

  @subscribe('verified')
  async handleUserVerified(event: { userId: string }) {
    console.log(`Activating features for user ${event.userId}`);
    await this.activatePremiumFeatures(event.userId);
  }

  private async sendWelcomeEmail(email: string) {
    // Email logic
  }

  private async createUserProfile(userId: string) {
    // Profile creation logic
  }

  private async activatePremiumFeatures(userId: string) {
    // Feature activation logic
  }
}
```

### Example 2: Transaction Processing with Logs

```typescript
// Setup log stream for audit trail
const factory = await StreamFactory.init(process.env.NATS_URL);
const txStream = await factory.logStream('transaction', '90d');

// Publisher
@Injectable()
export class PaymentService {
  constructor(private txStream: Stream<TransactionEvent>) {}

  async processPayment(amount: number, userId: string) {
    const txId = generateTxId();

    // Start transaction
    await this.txStream.add('started', {
      txId,
      userId,
      amount,
      status: 'pending',
      timestamp: new Date()
    });

    try {
      const result = await this.chargeCard(amount);

      // Success
      await this.txStream.add('completed', {
        txId,
        userId,
        amount,
        status: 'completed',
        result,
        timestamp: new Date()
      });
    } catch (error) {
      // Failure
      await this.txStream.add('failed', {
        txId,
        userId,
        amount,
        status: 'failed',
        error: error.message,
        timestamp: new Date()
      });
    }
  }
}

// Consumer
@Injectable()
@stream('transaction')
export class TransactionConsumer {
  @subscribe('completed')
  async handleTransactionCompleted(event: any) {
    await this.updateUserBalance(event.userId, event.amount);
    await this.sendReceipt(event.userId, event.txId);
  }

  @subscribe('failed')
  async handleTransactionFailed(event: any) {
    await this.notifyUser(event.userId, 'Payment failed');
    await this.logFailure(event.txId, event.error);
  }
}
```

---

## Middleware

Middleware allows you to add cross-cutting concerns like logging, validation, or error handling.

### Stream-Level Middleware

Apply middleware to all subscribers in a stream:

```typescript
import { stream, subscribe } from './mq/nats/consumer';

// Middleware function
async function loggingMiddleware(event: any, next: () => Promise<void>) {
  console.log('Before processing:', event);
  const start = Date.now();

  await next();

  console.log(`Processed in ${Date.now() - start}ms`);
}

async function authMiddleware(event: any, next: () => Promise<void>) {
  if (!event.userId) {
    throw new Error('userId is required');
  }
  await next();
}

@Injectable()
@stream('user', [loggingMiddleware, authMiddleware]) // Stream middleware
export class UserConsumer {
  @subscribe('created')
  async handleUserCreated(event: any) {
    // Both middleware run before this
    console.log('User created:', event);
  }
}
```

### Subscriber-Level Middleware

Apply middleware to specific subscribers:

```typescript
async function validateEmail(event: any, next: () => Promise<void>) {
  if (!event.email || !event.email.includes('@')) {
    throw new Error('Invalid email');
  }
  await next();
}

@Injectable()
@stream('user')
export class UserConsumer {
  @subscribe('created', [validateEmail]) // Subscriber middleware
  async handleUserCreated(event: any) {
    // validateEmail runs before this
    console.log('Valid user created:', event);
  }

  @subscribe('updated')
  async handleUserUpdated(event: any) {
    // No validation for updates
    console.log('User updated:', event);
  }
}
```

### Combining Middleware

Stream middleware runs first, followed by subscriber middleware:

```typescript
@Injectable()
@stream('user', [streamMiddleware1, streamMiddleware2])
export class UserConsumer {
  @subscribe('created', [subscriberMiddleware1, subscriberMiddleware2])
  async handleUserCreated(event: any) {
    // Execution order:
    // 1. streamMiddleware1
    // 2. streamMiddleware2
    // 3. subscriberMiddleware1
    // 4. subscriberMiddleware2
    // 5. handleUserCreated
  }
}
```

### Error Handling Middleware

```typescript
import { RetryError } from './retry';

async function errorHandler(event: any, next: () => Promise<void>) {
  try {
    await next();
  } catch (error) {
    if (error.message.includes('temporary')) {
      // Retry on temporary errors
      throw new RetryError(error.message);
    }

    // Log permanent errors but don't retry
    console.error('Permanent error:', error);
  }
}

@Injectable()
@stream('user', [errorHandler])
export class UserConsumer {
  @subscribe('created')
  async handleUserCreated(event: any) {
    // Protected by error handler
  }
}
```

---

## API Reference

### StreamFactory

#### `static async init(url: string, opts?: ConnectionOptions): Promise<StreamFactory>`

Create a factory with a NATS connection URL.

**Parameters:**

- `url` (string): NATS server URL or comma-separated URLs
- `opts` (ConnectionOptions, optional): NATS connection options

**Returns:** StreamFactory instance

---

#### `static async init(urls: string[], opts?: ConnectionOptions): Promise<StreamFactory>`

Create a factory with multiple NATS server URLs.

**Parameters:**

- `urls` (string[]): Array of NATS server URLs
- `opts` (ConnectionOptions, optional): NATS connection options

**Returns:** StreamFactory instance

---

#### `static async init(conn: NatsConnection): Promise<StreamFactory>`

Create a factory with an existing NATS connection.

**Parameters:**

- `conn` (NatsConnection): Existing NATS connection

**Returns:** StreamFactory instance

---

#### `async stream<T>(name: string, config: StreamConfig): Promise<Stream<T>>`

Create or update a stream.

**Parameters:**

- `name` (string): Stream name (lowercase)
- `config` (StreamConfig): Stream configuration

**Returns:** Stream instance

---

#### `async broadcastStream<T>(name: string, buffer?: number): Promise<Stream<T>>`

Create a broadcast stream (memory-based, limited retention).

**Parameters:**

- `name` (string): Stream name
- `buffer` (number, optional, default: 100): Maximum messages to buffer

**Returns:** Stream instance

---

#### `async logStream<T>(name: string, period?: string): Promise<Stream<T>>`

Create a log stream (file-based, time retention).

**Parameters:**

- `name` (string): Stream name
- `period` (string, optional, default: '1d'): Retention period

**Returns:** Stream instance

---

#### `async isConnected(): Promise<boolean>`

Check if NATS connection is active.

**Returns:** true if connected

---

#### `async stop(): Promise<void>`

Close the NATS connection (only if factory manages it).

---

### Stream<T>

#### `async add(path: string, data: T): Promise<void>`

Publish an event to the stream.

**Parameters:**

- `path` (string): Subject path (appended to stream name)
- `data` (T): Event payload

**Example:**

```typescript
await stream.add('created', { userId: '123' });
// Publishes to: stream_name.created
```

---

### Decorators

#### `@stream(name: string, middleware?: Middleware[])`

Declare a stream consumer class.

**Parameters:**

- `name` (string): Stream name
- `middleware` (Middleware[], optional): Stream-level middleware

---

#### `@subscribe(subject: string, middleware?: Middleware[])`

Subscribe to events on a subject.

**Parameters:**

- `subject` (string): Subject pattern (supports wildcards)
- `middleware` (Middleware[], optional): Subscriber-level middleware

---

### Consumers

#### `constructor(moduleRef: ModuleRef)`

Create consumers from decorated classes.

**Parameters:**

- `moduleRef` (ModuleRef): NestJS module reference

---

#### `async start(nats: NatsConnection, logger: Logger, config: NatsConfig): Promise<void>`

Start consuming messages.

**Parameters:**

- `nats` (NatsConnection): NATS connection
- `logger` (Logger): Logger instance
- `config` (NatsConfig): Consumer configuration

---

## Best Practices

### 1. Use Type-Safe Events

Define interfaces for all event types:

```typescript
// ✅ Good
interface UserCreatedEvent {
  userId: string;
  email: string;
  createdAt: Date;
}

const stream = await factory.broadcastStream<UserCreatedEvent>('user');

// ❌ Bad
const stream = await factory.broadcastStream('user'); // No type safety
```

### 2. Choose the Right Stream Type

- **Broadcast**: Real-time events, notifications, ephemeral data
- **Log**: Audit trails, event sourcing, historical analysis

```typescript
// ✅ Good - Real-time notifications
const notifications = await factory.broadcastStream('notification', 50);

// ✅ Good - Transaction audit log
const transactions = await factory.logStream('transaction', '365d');
```

### 3. Use Meaningful Subject Hierarchies

```typescript
// ✅ Good - Clear hierarchy
await stream.add('user.created', event);
await stream.add('user.updated', event);
await stream.add('user.deleted', event);

// ❌ Bad - Flat structure
await stream.add('created', event);
await stream.add('updated', event);
```

### 4. Handle Errors Gracefully

```typescript
@subscribe('created')
async handleUserCreated(event: UserCreatedEvent) {
  try {
    await this.processEvent(event);
  } catch (error) {
    if (this.isTemporaryError(error)) {
      throw new RetryError('Will retry');  // Message will be redelivered
    }

    // Permanent error - log and continue
    this.logger.error('Permanent error:', error);
  }
}
```

### 5. Use Environment Variables

```typescript
// ✅ Good
const factory = await StreamFactory.init(process.env.NATS_URL);

// ❌ Bad
const factory = await StreamFactory.init('nats://localhost:4222');
```

### 6. Set Appropriate Batch Sizes

- Small batch (1-10): Low latency, higher overhead
- Medium batch (10-50): Balanced
- Large batch (50-100): High throughput, higher latency

```typescript
await consumers.start(nats, logger, {
  namespace: 'my-app',
  batch_size: 10, // Adjust based on your needs
  timeout: '30s'
});
```

### 7. Use Namespaces to Avoid Conflicts

```typescript
// Development
await consumers.start(nats, logger, {
  batch_size: 10,
  namespace: 'my-app-dev',
  timeout: '30s'
});

// Production
await consumers.start(nats, logger, {
  namespace: 'my-app-prod',
  batch_size: 50,
  timeout: '60s',
});
```

### 8. Implement Idempotent Handlers

Consumers use at-least-once delivery, so handlers may receive duplicates:

```typescript
@subscribe('created')
async handleUserCreated(event: UserCreatedEvent) {
  // Check if already processed
  const exists = await this.db.users.findById(event.userId);
  if (exists) {
    return; // Already processed
  }

  // Process event
  await this.createUser(event);
}
```

---

## Troubleshooting

### No Messages Being Consumed

**Possible Causes:**

1. **Stream doesn't exist**

   ```typescript
   // Ensure stream is created before consumers start
   await factory.broadcastStream('user');
   ```

2. **Subject mismatch**

   ```typescript
   // Publisher
   await stream.add('user.created', event);  // ❌ Wrong
   await stream.add('created', event);       // ✅ Correct

   // Consumer
   @subscribe('created')  // Must match
   ```

3. **Consumer not registered**
   ```typescript
   // Ensure consumer class is in module providers
   @Module({
     providers: [UserEventConsumer],  // ✅ Must be here
   })
   ```

### Messages Being Redelivered Repeatedly

**Problem:** Handler is throwing errors without acknowledgment.

**Solution:**

```typescript
@subscribe('created')
async handleUserCreated(event: any) {
  try {
    await this.process(event);
    // Message auto-acked on success
  } catch (error) {
    if (this.shouldRetry(error)) {
      throw new RetryError('Retry');  // Will redeliver
    }
    // Don't throw - message will be acked
    this.logger.error('Permanent error:', error);
  }
}
```

### Stream Type Mismatch Error

**Problem:** Trying to create a stream with different type than existing.

**Error:** `The user stream is already defined with a different stream type`

**Solution:** Delete the existing stream or use a different name:

```bash
# Using NATS CLI
nats stream rm user
```

### High Memory Usage

**Problem:** Broadcast stream buffer too large.

**Solution:** Reduce buffer size or switch to log stream:

```typescript
// ✅ Smaller buffer
const stream = await factory.broadcastStream('user', 50);

// ✅ Or use log stream
const stream = await factory.logStream('user', '1d');
```

### Timeout Issues

**Problem:** Messages timing out before processing completes.

**Solution:** Increase timeout or optimize handler:

```typescript
await consumers.start(nats, logger, {
  namespace: 'my-app',
  batch_size: 10,
  timeout: '2m' // Increased from 30s
});
```

### Connection Errors

**Problem:** Cannot connect to NATS server.

**Solutions:**

1. Verify NATS is running:

   ```bash
   nats-server
   ```

2. Check URL format:

   ```typescript
   // ✅ Correct
   'nats://localhost:4222';
   'nats://user:pass@host:4222';

   // ❌ Wrong
   'localhost:4222';
   'nats:localhost:4222';
   ```

3. Check network/firewall rules

---

## Additional Resources

- [NATS Documentation](https://docs.nats.io/)
- [JetStream Guide](https://docs.nats.io/nats-concepts/jetstream)
- [NestJS Microservices](https://docs.nestjs.com/microservices/basics)
- [Message Patterns and Best Practices](https://docs.nats.io/nats-concepts/subjects)

---

**Last Updated:** November 9, 2025
