/**
 * Browser shim for `node:async_hooks` — used by `@langchain/langgraph` for
 * trace-context propagation across async boundaries.
 *
 * In WKWebView (browser) we don't have AsyncLocalStorage. This stub provides
 * the minimum API surface LangGraph touches at module-load time so the
 * production bundle builds. Trace-context propagation is degraded (the store
 * is always undefined), but graph execution itself does not depend on it.
 *
 * If we later need real cross-async context (e.g. for OpenTelemetry traces in
 * the WKWebView), replace with a polyfill like `unenv/runtime/node/async_hooks`.
 */

export class AsyncLocalStorage<T = unknown> {
  private store: T | undefined;

  getStore(): T | undefined {
    return this.store;
  }

  run<R>(_store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    const prev = this.store;
    this.store = _store;
    try {
      return callback(...args);
    } finally {
      this.store = prev;
    }
  }

  enterWith(store: T): void {
    this.store = store;
  }

  disable(): void {
    this.store = undefined;
  }

  exit<R>(callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    const prev = this.store;
    this.store = undefined;
    try {
      return callback(...args);
    } finally {
      this.store = prev;
    }
  }
}

export class AsyncResource {
  constructor(_type: string, _options?: unknown) {}
  runInAsyncScope<R>(callback: (...args: unknown[]) => R, _thisArg?: unknown, ...args: unknown[]): R {
    return callback(...args);
  }
  emitDestroy(): this {
    return this;
  }
  asyncId(): number {
    return 0;
  }
  triggerAsyncId(): number {
    return 0;
  }
}

export function executionAsyncId(): number {
  return 0;
}

export function triggerAsyncId(): number {
  return 0;
}

export function createHook(_callbacks: unknown): { enable: () => void; disable: () => void } {
  return { enable: () => {}, disable: () => {} };
}

export default {
  AsyncLocalStorage,
  AsyncResource,
  executionAsyncId,
  triggerAsyncId,
  createHook,
};
