import { Injectable } from '@nestjs/common';
import { JSONCodec, JetStreamClient } from 'nats';
import { v4 as uuidV4 } from 'uuid';

@Injectable()
export class Stream<T> {
  private codec = JSONCodec();

  constructor(
    private name: string,
    private client: JetStreamClient
  ) {}

  /**
   * Adds a new message to the stream under the given path
   * @param path the path under which to add the message
   * @param data the message to add
   * @returns a promise that resolves when the message has been added
   */
  async add(path: string, data: T): Promise<void> {
    const message = this.codec.encode(data);
    await this.client.publish(`${this.name.toLowerCase()}.${path}`, message, { msgID: uuidV4() });
  }
}
