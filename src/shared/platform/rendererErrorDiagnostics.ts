import { logRuntimeError } from './runtimeLogging';

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

export function installRendererErrorDiagnostics() {
  window.addEventListener('error', (event) => {
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
    logRuntimeError('unhandled rejection', {
      action: 'unhandled_rejection',
      area: 'bridge',
      reason: describeUnknownError(event.reason)
    });
  });
}
