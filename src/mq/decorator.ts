import { Injectable } from "@nestjs/common";
import { MiddlewareConfiguration } from "@nestjs/common/interfaces";

export interface Group {
  tag: string;
  middleware: MiddlewareConfiguration[];
  constructor: any;
}

export interface Handler {
  tag: string;
  class_name: string;
  method: string;
  middleware: MiddlewareConfiguration[];
}

export interface ParsedHandler {
  group_tag: string;
  handler_tag: string;
  group_middleware: MiddlewareConfiguration[];
  handler_middleware: MiddlewareConfiguration[];
  handler: (...args: any[]) => Promise<any>;
}

export function groupDecorator(s: Symbol) {
  return (tag: string, ...middleware: MiddlewareConfiguration[]) => {
    return (constructor: any) => {
      Injectable()(constructor); // Make the class injectable
      const metadata: Group = { tag, middleware, constructor };
      Reflect.defineMetadata(s, metadata, constructor);

      // add to global list of event groups
      const groupMetadata: Group[] = Reflect.getMetadata(s, Reflect) || [];
      const updatedGroupMetadata = [metadata, ...groupMetadata];
      Reflect.defineMetadata(s, updatedGroupMetadata, Reflect);
    };
  };
}

export function handlerDecorator(s: Symbol) {
  return (tag: string, ...middleware: MiddlewareConfiguration[]) => {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const className = target.constructor.name;
      const metadata: Handler = {
        tag,
        class_name: className,
        method: propertyKey,
        middleware
      };
      const handlers: Handler[] = Reflect.getMetadata(s, target.constructor) || [];
      handlers.push(metadata);
      Reflect.defineMetadata(s, handlers, target.constructor);
    };
  };
}

export function parseHandlers(groupKey: Symbol, handlerKey: Symbol): ParsedHandler[] {
  const groups: Group[] = [];
  const handlers: ParsedHandler[] = [];

  // Collect groups metadata
  const globalGroups: Group[] = Reflect.getMetadata(groupKey, Reflect) || [];
  groups.push(...globalGroups);

  groups.forEach(({ tag: groupTag, middleware: groupMiddleware, constructor }) => {
    const handlerMetadata: Handler[] = Reflect.getMetadata(handlerKey, constructor) || [];

    handlerMetadata.forEach(({ tag, method, middleware }) => {
      const instance = new constructor(); // Create instance for each handler (simplified)
      const handlerFn = instance[method].bind(instance);

      handlers.push({
        group_tag: groupTag,
        handler_tag: tag,
        group_middleware: groupMiddleware,
        handler_middleware: middleware,
        handler: handlerFn
      });
    });
  });

  return handlers;
}
