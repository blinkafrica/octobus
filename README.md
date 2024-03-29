# Blink Base Service

## Description

This is the base service for the Blink project. It acts as a template for other services to be built on top of. It provides a basic structure for a service, including a database connection, a message queue connection, and a basic REST API.

## Tools

- Docker
- RabbitMQ
- NestJS
- TypeORM
- PostgreSQL

## Installation

```bash
yarn install
```

## Running the app

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Test

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## License

Blink is [MIT licensed](LICENSE).
