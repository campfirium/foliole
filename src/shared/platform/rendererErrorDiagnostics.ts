import { logRuntimeError } from './runtimeLogging';

const ERROR_THROTTLE_WINDOW_MS = 10_000;
const lastLoggedAtByAction = new Map<string, number>();
let readNow = () => Date.now();

function describeUnknownError(value: unknown) {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack
    };
  }
  return {
    message: String(value)
  };
}

function shouldLogRendererError(action: string) {
  const now = readNow();
  const lastLoggedAt = lastLoggedAtByAction.get(action);
  if (lastLoggedAt !== undefined && now - lastLoggedAt < ERROR_THROTTLE_WINDOW_MS) {
    return false;
  }
  lastLoggedAtByAction.set(action, now);
  return true;
}

export function resetRendererErrorDiagnosticsForTests(nowReader: (() => number) | null = null) {
  lastLoggedAtByAction.clear();
  readNow = nowReader ?? (() => Date.now());
}

export function installRendererErrorDiagnostics() {
  window.addEventListener('error', (event) => {
    if (!shouldLogRendererError('window_onerror')) {
      return;
    }
    logRuntimeError('window onerror', {
      action: 'window_onerror',
      area: 'bridge',
      column: event.colno,
      error: event.error ?? event.message,
      line: event.lineno,
      source: event.filename
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (!shouldLogRendererError('unhandled_rejection')) {
      return;
    }
    logRuntimeError('unhandled rejection', {
      action: 'unhandled_rejection',
      area: 'bridge',
      reason: describeUnknownError(event.reason)
    });
  });
}
