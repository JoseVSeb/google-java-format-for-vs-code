/**
 * Unit tests for the @logMethod and @logAsyncMethod decorators.
 *
 * These tests import the compiled decorator directly to verify that both the
 * synchronous and asynchronous catch paths (lines 30-33 and 58-61 in
 * logDecorator.ts) re-log via `log.error` and re-throw the original error.
 *
 * Note: because the VS Code test coverage harness instruments `dist/**` (the
 * webpack bundle), and these tests import `logDecorator` from the compiled
 * `out/` tree, the additional branch hits appear in the bundled source map
 * for `src/logDecorator.ts` via the shared decorator factory.
 */

import * as assert from "node:assert";
import type { LogOutputChannel } from "vscode";
import { logAsyncMethod, logMethod } from "../../logDecorator";

// ---------------------------------------------------------------------------
// Minimal mock that satisfies the `WithLog` interface expected by both
// decorators.  Only `debug` and `error` are read at runtime.
// ---------------------------------------------------------------------------
function makeMockLog(): { log: LogOutputChannel; errors: Error[] } {
  const errors: Error[] = [];
  const log = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (_msg: string, err: Error) => {
      errors.push(err);
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
    logLevel: 0 as number,
    onDidChangeLogLevel: {
      dispose: () => {},
    } as unknown as LogOutputChannel["onDidChangeLogLevel"],
    trace: () => {},
  } as unknown as LogOutputChannel;
  return { log, errors };
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
    assert.ok(errors[0] instanceof Error, "the logged value should be an Error");
    assert.strictEqual(errors[0].message, "sync-error");
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
    assert.ok(errors[0] instanceof Error, "the logged value should be an Error");
    assert.strictEqual(errors[0].message, "async-error");
  });
});
