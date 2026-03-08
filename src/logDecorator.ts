import type { LogOutputChannel } from "vscode";

/**
 * Interface that all decorated classes must satisfy.
 * The decorator reads `this.log` to access the output channel.
 */
interface WithLog {
  readonly log: LogOutputChannel;
}

/**
 * Method decorator that logs entry, exit, and errors for **synchronous** class methods.
 * Uses the property key (preserved by TypeScript even in minified/production builds)
 * instead of `Function.prototype.name` which gets mangled by bundlers.
 */
export function logMethod(
  _target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const methodName = String(propertyKey);
  const original = descriptor.value as (this: WithLog, ...args: unknown[]) => unknown;

  descriptor.value = function (this: WithLog, ...args: unknown[]) {
    this.log.debug(`Calling "${methodName}" with arguments:`, args);
    try {
      const result = original.apply(this, args);
      this.log.debug(`"${methodName}" returned:`, result);
      return result;
    } catch (error) {
      this.log.error(`Error in "${methodName}":`, error as Error);
      throw error;
    }
  };

  return descriptor;
}

/**
 * Method decorator that logs entry, exit, and errors for **async** class methods.
 * Uses the property key (preserved by TypeScript even in minified/production builds)
 * instead of `Function.prototype.name` which gets mangled by bundlers.
 */
export function logAsyncMethod(
  _target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const methodName = String(propertyKey);
  const original = descriptor.value as (this: WithLog, ...args: unknown[]) => Promise<unknown>;

  descriptor.value = async function (this: WithLog, ...args: unknown[]) {
    this.log.debug(`Calling "${methodName}" with arguments:`, args);
    try {
      const result = await original.apply(this, args);
      this.log.debug(`"${methodName}" returned:`, result);
      return result;
    } catch (error) {
      this.log.error(`Error in "${methodName}":`, error as Error);
      throw error;
    }
  };

  return descriptor;
}
