// @vitest-environment node

import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { createElectronRuntimeWatcher } from './electron-dev-runtime-watch.mjs';

function createHarness({ compileResults }) {
  const callbacks = [];
  const timers = [];
  const restart = vi.fn(async () => undefined);
  const compile = vi.fn(async () => compileResults.shift());
  const watcher = createElectronRuntimeWatcher({
    onCompile: compile,
    onRestart: restart,
    setTimer: (callback) => { timers.push(callback); return callback; },
    targets: [{ path: '/electron', recursive: true }],
    watch: (_path, _options, callback) => {
      callbacks.push(callback);
      const emitter = new EventEmitter();
      emitter.close = vi.fn();
      return emitter;
    }
  });
  return { callbacks, compile, restart, timers, watcher };
}

describe('Electron runtime compile watcher', () => {
  it('restarts only after a successful compile', async () => {
    const harness = createHarness({ compileResults: [true] });
    harness.callbacks[0]('change', 'main.ts');
    harness.timers.shift()();
    await vi.waitFor(() => expect(harness.restart).toHaveBeenCalledOnce());
    expect(harness.compile).toHaveBeenCalledOnce();
    harness.watcher.close();
  });

  it('keeps the old runtime after compile failure and retries on the next event', async () => {
    const harness = createHarness({ compileResults: [false, true] });
    harness.callbacks[0]('change', 'preload.ts');
    harness.timers.shift()();
    await vi.waitFor(() => expect(harness.compile).toHaveBeenCalledTimes(1));
    expect(harness.restart).not.toHaveBeenCalled();

    harness.callbacks[0]('change', 'preload.ts');
    harness.timers.shift()();
    await vi.waitFor(() => expect(harness.restart).toHaveBeenCalledOnce());
    harness.watcher.close();
  });
});
