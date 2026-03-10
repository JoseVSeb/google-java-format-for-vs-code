/**
 * Unit tests for the @logMethod and @logAsyncMethod decorators.
 *
 * These tests cover both decorator wrappers and the trace-only serialization
 * helpers that sit behind them: no-argument calls, undefined return values,
 * multiline string trimming, Map/Set serialization, and the fallback paths for
 * unserializable values.
 */

import * as assert from "node:assert";
import type { LogOutputChannel } from "vscode";
import { LogLevel } from "vscode";
import { logAsyncMethod, logMethod } from "../../logDecorator";

// Keep these in sync with the truncation thresholds in src/logDecorator.ts.
const MULTILINE_PREVIEW_CHARS = 40;
const LONG_MULTILINE_SEGMENT_LENGTH = 50;

// ---------------------------------------------------------------------------
// Minimal mock that satisfies the `WithLog` interface expected by both
// decorators.  Only `trace` and `error` are asserted in these tests.
// ---------------------------------------------------------------------------
function makeMockLog(logLevel = LogLevel.Info): {
  log: LogOutputChannel;
  errors: Array<{ message: string; error: Error }>;
  traces: string[];
} {
  const errors: Array<{ message: string; error: Error }> = [];
  const traces: string[] = [];
  const log = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string, error: Error) => {
      errors.push({ message, error });
    },
    trace: (message: string) => {
      traces.push(message);
    },
    // Remaining LogOutputChannel members – not exercised by the decorator.
    append: () => {},
    appendLine: () => {},
    replace: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
    name: "mock",
    logLevel,
    onDidChangeLogLevel: {
      dispose: () => {},
    } as unknown as LogOutputChannel["onDidChangeLogLevel"],
  } as unknown as LogOutputChannel;
  return { log, errors, traces };
}

function assertTraceContainsSerializedValue(
  trace: string,
  prefix: string,
  expectedSerializedSubstrings: string[],
): void {
  assert.ok(trace.startsWith(prefix));
  for (const expectedSerializedSubstring of expectedSerializedSubstrings) {
    assert.ok(trace.includes(expectedSerializedSubstring));
  }
}

// ---------------------------------------------------------------------------
suite("logDecorator – unit", () => {
  // -------------------------------------------------------------------------
  // @logMethod (synchronous)
  // -------------------------------------------------------------------------

  test("logMethod: forwards return value on success", () => {
    const { log } = makeMockLog();

    class Greeter {
      readonly log = log;

      @logMethod
      greet(name: string) {
        return `hello ${name}`;
      }
    }

    assert.strictEqual(new Greeter().greet("world"), "hello world");
  });

  test("logMethod catch: calls log.error and re-throws when the decorated method throws", () => {
    const { log, errors } = makeMockLog();

    class SyncThrower {
      readonly log = log;

      @logMethod
      doThrow(): never {
        throw new Error("sync-error");
      }
    }

    assert.throws(() => new SyncThrower().doThrow(), /sync-error/);
    assert.strictEqual(errors.length, 1, "log.error should have been called exactly once");
    assert.ok(errors[0].error instanceof Error, "the logged value should be an Error");
    assert.strictEqual(errors[0].message, "Error in SyncThrower.doThrow");
    assert.strictEqual(errors[0].error.message, "sync-error");
  });

  test("logMethod trace: logs no arguments and undefined return value", () => {
    const { log, traces } = makeMockLog(LogLevel.Trace);

    class VoidMethod {
      readonly log = log;

      @logMethod
      noArgs(): void {}
    }

    assert.strictEqual(new VoidMethod().noArgs(), undefined);
    assert.deepStrictEqual(traces, [
      "VoidMethod.noArgs called with: (no arguments)",
      "VoidMethod.noArgs returned: undefined",
    ]);
  });

  test("logMethod trace: serializes multiline strings, Map, and Set values", () => {
    const { log, traces } = makeMockLog(LogLevel.Trace);

    class Echo {
      readonly log = log;

      @logMethod
      echo(value: unknown) {
        return value;
      }
    }

    const shortMultilineInput = "a\nb";
    const longMultilineInput = `${"a".repeat(LONG_MULTILINE_SEGMENT_LENGTH)}\n${"b".repeat(LONG_MULTILINE_SEGMENT_LENGTH)}`;
    const expectedTruncatedOutput = `${longMultilineInput.slice(0, MULTILINE_PREVIEW_CHARS)}...${longMultilineInput.slice(-MULTILINE_PREVIEW_CHARS)}`;
    const value = {
      longMultiline: longMultilineInput,
      map: new Map([["one", 1]]),
      set: new Set(["x", "y"]),
      shortMultiline: shortMultilineInput,
    };

    assert.deepStrictEqual(new Echo().echo(value), value);
    assert.strictEqual(traces.length, 2);
    const expectedSerializedSubstrings = [
      `"shortMultiline":${JSON.stringify(shortMultilineInput)}`,
      `"longMultiline":${JSON.stringify(expectedTruncatedOutput)}`,
      '"map":{"__type__":"Map","entries":[["one",1]]}',
      '"set":{"__type__":"Set","values":["x","y"]}',
    ];

    assertTraceContainsSerializedValue(
      traces[0],
      "Echo.echo called with: [",
      expectedSerializedSubstrings,
    );
    assertTraceContainsSerializedValue(
      traces[1],
      "Echo.echo returned: {",
      expectedSerializedSubstrings,
    );
  });

  test("logMethod trace: falls back when arguments or return values are unserializable", () => {
    const { log, traces } = makeMockLog(LogLevel.Trace);

    class CircularEcho {
      readonly log = log;

      @logMethod
      echo(value: unknown) {
        return value;
      }
    }

    const circular: { self?: unknown } = {};
    circular.self = circular;

    assert.strictEqual(new CircularEcho().echo(circular), circular);
    assert.deepStrictEqual(traces, [
      "CircularEcho.echo called with: (unserializable)",
      "CircularEcho.echo returned: (unserializable)",
    ]);
  });

  // -------------------------------------------------------------------------
  // @logAsyncMethod (asynchronous)
  // -------------------------------------------------------------------------

  test("logAsyncMethod: forwards resolved value on success", async () => {
    const { log } = makeMockLog();

    class AsyncAdder {
      readonly log = log;

      @logAsyncMethod
      async add(a: number, b: number) {
        return a + b;
      }
    }

    assert.strictEqual(await new AsyncAdder().add(2, 3), 5);
  });

  test("logAsyncMethod catch: calls log.error and re-throws when the decorated async method rejects", async () => {
    const { log, errors } = makeMockLog();

    class AsyncThrower {
      readonly log = log;

      @logAsyncMethod
      async doThrow(): Promise<never> {
        throw new Error("async-error");
      }
    }

    await assert.rejects(() => new AsyncThrower().doThrow(), /async-error/);
    assert.strictEqual(errors.length, 1, "log.error should have been called exactly once");
    assert.ok(errors[0].error instanceof Error, "the logged value should be an Error");
    assert.strictEqual(errors[0].message, "Error in AsyncThrower.doThrow");
    assert.strictEqual(errors[0].error.message, "async-error");
  });

  test("logAsyncMethod trace: logs qualified method name, arguments, and resolved return value", async () => {
    const { log, traces } = makeMockLog(LogLevel.Trace);

    class AsyncEcho {
      readonly log = log;

      @logAsyncMethod
      async echo(value: string) {
        return value;
      }
    }

    assert.strictEqual(await new AsyncEcho().echo("hello"), "hello");
    assert.deepStrictEqual(traces, [
      'AsyncEcho.echo called with: ["hello"]',
      'AsyncEcho.echo returned: "hello"',
    ]);
  });
});
