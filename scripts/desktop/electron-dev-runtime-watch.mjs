import fs from 'node:fs';

const DEFAULT_DEBOUNCE_MS = 180;

export function createElectronRuntimeWatcher({
  clearTimer = globalThis.clearTimeout,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  log = () => undefined,
  onCompile,
  onRestart,
  onWatchError,
  setTimer = globalThis.setTimeout,
  targets,
  watch = fs.watch
}) {
  let closed = false;
  let compileRunning = false;
  let pending = false;
  let timer = null;
  const watchers = [];

  const schedule = () => {
    if (closed) return;
    pending = true;
    if (compileRunning) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void compilePending();
    }, debounceMs);
  };

  const compilePending = async () => {
    if (closed || compileRunning || !pending) return;
    pending = false;
    compileRunning = true;
    log('compile_started');
    try {
      const succeeded = await onCompile();
      if (!succeeded) {
        log('compile_failed');
      } else if (pending) {
        log('compile_superseded');
      } else {
        log('compile_succeeded');
        await onRestart();
      }
    } catch (error) {
      log('compile_or_restart_failed', error);
    } finally {
      compileRunning = false;
      if (pending && !closed) schedule();
    }
  };

  try {
    for (const target of targets) {
      const watcher = watch(target.path, { recursive: target.recursive === true }, (_event, fileName) => {
        if (!target.matches || fileName == null || target.matches(String(fileName))) schedule();
      });
      watcher.on?.('error', (error) => {
        log('watch_failed', error);
        onWatchError?.(error);
      });
      watchers.push(watcher);
    }
  } catch (error) {
    watchers.forEach((watcher) => watcher.close());
    throw error;
  }

  return {
    close() {
      closed = true;
      if (timer) clearTimer(timer);
      watchers.forEach((watcher) => watcher.close());
    },
    schedule
  };
}
