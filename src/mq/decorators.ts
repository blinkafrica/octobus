import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { Middleware } from './handlers';

export type Constructor = new (...args: never[]) => any;

/**
 * Metadata extracted by group decorator
 */
export interface Group {
  /**
   * tag for the group
   */
  tag: string;
  /**
   * middlewares for all handlers in the group
   */
  middleware: Middleware[];
  /**
   * constructor of the class
   */
  constructor: Constructor;
}

/**
 * Metadata extracted by the handler decorator
 */
export interface Handler {
  /**
   * a tag for the handler
   */
  tag: string;
  /**
   * name of the method
   */
  method: string;
  /**
   * name of the class the method belongs to
   */
  class_name: string;
  /**
   * middleware for the specific handler
   */
  middleware: Middleware[];
}

/**
 * A bounded handler function(meaning access to dependencies) with metadata
 */
export interface ParsedHandler {
  /**
   * tag for the group
   */
  group_tag: string;
  /**
   * tag for the specific handler
   */
  handler_tag: string;
  /**
   * all the middleware defined for the group
   */
  group_middleware: Middleware[];
  /**
   * all the middleware defined for the handler
   */
  handler_middleware: Middleware[];
  /**
   * bounded handler function.
   */
  handler: (...args: any[]) => Promise<void> | void;
}

/**
 * Create a decorator for capturing a group of handlers. Note that it also makes
 * the class injectable for the sake of dependency inversion. The decorator accepts
 * middleware.
 * @param s namespace to store metadata
 */
export function groupDecorator(s: symbol) {
  return function group(tag: string, ...middleware: Middleware[]) {
    return function (constructor: Constructor) {
      // make the class injectable by default
      Injectable()(constructor);

      const metadata: Group = { tag, middleware, constructor };
      Reflect.defineMetadata(s, metadata, constructor);

      // add to global list of event groups
      const groupMetadata: Group[] = Reflect.getMetadata(s, Reflect) || [];
      const updatedGroupMetadata = [metadata, ...groupMetadata];
      Reflect.defineMetadata(s, updatedGroupMetadata, Reflect);
    };
  };
}

/**
 * Create a decorator for capturing a single handler that has been defined as a method
 * in group of handlers.. The decorator accepts a tag for the handler(event or subject) and
 * middleware.
 * @param s namespace to store metadata
 */
export function handlerDecorator(s: symbol) {
  return function handler(tag: string, ...middleware: Middleware[]): MethodDecorator {
    return function (prototype: any, method: string, _desc: PropertyDescriptor) {
      const className = prototype.constructor.name;
      const metadata: Handler = { tag, class_name: className, method, middleware };

      let methodMetadata: Handler[] = [];
      if (!Reflect.hasMetadata(s, prototype.constructor)) {
        Reflect.defineMetadata(s, methodMetadata, prototype.constructor);
      } else {
        methodMetadata = Reflect.getMetadata(s, prototype.constructor);
      }

      methodMetadata.push(metadata);
    };
  };
}

export function parseHandlers(moduleRef: ModuleRef, groupKey: symbol, handlerKey: symbol) {
  const groups = collectMetadata<Group[]>(groupKey, Reflect, []);
  const handlers: ParsedHandler[] = [];

  groups?.forEach(({ tag: groupTag, middleware: groupMiddleware, constructor }) => {
    const methodMeta = collectMetadata<Handler[]>(handlerKey, constructor);

    methodMeta?.forEach(({ tag, method, middleware }) => {
      const instance = moduleRef.get(constructor, { strict: false }); // Retrieve instance from moduleRef
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

export function collectMetadata<T>(key: any, target: object, defaultVal?: T) {
  const result: T = Reflect.getMetadata(key, target);
  if (result) {
    Reflect.deleteMetadata(key, target);
  }

  return result ?? defaultVal;
}
