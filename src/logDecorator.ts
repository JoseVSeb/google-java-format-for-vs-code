import type { LogOutputChannel } from "vscode";
import { LogLevel } from "vscode";

/**
 * Interface that all decorated classes must satisfy.
 * The decorator reads `this.log` to access the output channel.
 */
interface WithLog {
  readonly log: LogOutputChannel;
}

/**
 * JSON.stringify replacer applied to decorator argument and return-value logging.
 *
 * - **Multiline strings** (likely source file content): truncated to a one-line
 *   preview of ≤60 chars followed by "…" so that large document buffers do not
 *   flood the output channel.
 * - **Absolute file-system paths** and **file:// URIs**: redacted to only the
 *   last path component (`<.../filename>`), hiding directory structure that may
 *   expose the user's file system layout.
 * - **Map / Set**: serialised as `{ __type__: "Map", entries: [...] }` /
 *   `{ __type__: "Set", values: [...] }` because the default JSON.stringify
 *   reduces both to `{}`.
 */
function logReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "string") {
    // Source-file content or any other multi-line string — show a short preview.
    if (value.includes("\n")) {
      const preview = value.slice(0, 60).replace(/\n/g, "↵");
      return `${preview}…`;
    }
    // Absolute file-system paths (Unix / Windows) and file:// URIs — show only
    // the last path component so directory structure is not exposed.
    if (/^(?:[A-Za-z]:[/\\]|\/)/.test(value) || value.startsWith("file://")) {
      const filename =
        value
          .replace(/[/\\]+$/, "")
          .split(/[/\\]/)
          .pop() ?? value;
      return `<.../${filename}>`;
    }
    return value;
  }
  if (value instanceof Map) {
    return { __type__: "Map", entries: [...value.entries()] };
  }
  if (value instanceof Set) {
    return { __type__: "Set", values: [...value.values()] };
  }
  return value;
}

/** Serialises method arguments to a human-readable string for trace logging. */
function serializeArgs(args: unknown[]): string {
  if (args.length === 0) return "(no arguments)";
  try {
    return JSON.stringify(args, logReplacer);
  } catch {
    return "(unserializable)";
  }
}

/** Serialises a return value for trace logging. */
function serializeResult(result: unknown): string {
  try {
    return JSON.stringify(result, logReplacer) ?? "undefined";
  } catch {
    return "(unserializable)";
  }
}

/**
 * Method decorator that logs entry, exit, and errors for **synchronous** class methods.
 *
 * - Entry / exit messages are emitted at the **trace** level and only when the
 *   log channel has trace enabled — expensive serialisation is skipped entirely
 *   when a less-verbose log level is active.
 * - Error messages are always emitted at the **error** level regardless of the
 *   configured log level.
 * - The log message includes `ClassName.methodName` for disambiguation.
 *   Note: in production (minified) builds the class name may be obfuscated;
 *   trace logs are primarily a development / debugging aid.
 */
export function logMethod(
  _target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  // Capture the class name at decoration time (module load); works correctly
  // in non-minified (dev) builds and provides a best-effort hint in production.
  const className = (_target as { constructor: { name: string } }).constructor.name;
  const methodName = String(propertyKey);
  const qualifiedName = `${className}.${methodName}`;
  const original = descriptor.value as (this: WithLog, ...args: unknown[]) => unknown;

  descriptor.value = function (this: WithLog, ...args: unknown[]) {
    if (this.log.logLevel === LogLevel.Trace) {
      this.log.trace(`${qualifiedName} called with: ${serializeArgs(args)}`);
    }
    try {
      const result = original.apply(this, args);
      if (this.log.logLevel === LogLevel.Trace) {
        this.log.trace(`${qualifiedName} returned: ${serializeResult(result)}`);
      }
      return result;
    } catch (error) {
      this.log.error(`Error in ${qualifiedName}`, error as Error);
      throw error;
    }
  };

  return descriptor;
}

/**
 * Method decorator that logs entry, exit, and errors for **async** class methods.
 *
 * Behaves identically to {@link logMethod} but `await`s the wrapped method so
 * that the resolved value (not a `Promise`) is serialised on exit.
 */
export function logAsyncMethod(
  _target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const className = (_target as { constructor: { name: string } }).constructor.name;
  const methodName = String(propertyKey);
  const qualifiedName = `${className}.${methodName}`;
  const original = descriptor.value as (this: WithLog, ...args: unknown[]) => Promise<unknown>;

  descriptor.value = async function (this: WithLog, ...args: unknown[]) {
    if (this.log.logLevel === LogLevel.Trace) {
      this.log.trace(`${qualifiedName} called with: ${serializeArgs(args)}`);
    }
    try {
      const result = await original.apply(this, args);
      if (this.log.logLevel === LogLevel.Trace) {
        this.log.trace(`${qualifiedName} returned: ${serializeResult(result)}`);
      }
      return result;
    } catch (error) {
      this.log.error(`Error in ${qualifiedName}`, error as Error);
      throw error;
    }
  };

  return descriptor;
}
