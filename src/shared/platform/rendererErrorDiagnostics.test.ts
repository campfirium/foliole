import { afterEach, expect, it, vi } from 'vitest';

const { logRuntimeError } = vi.hoisted(() => ({
  logRuntimeError: vi.fn()
}));

vi.mock('./runtimeLogging', () => ({ logRuntimeError }));

import {
  installRendererErrorDiagnostics,
  resetRendererErrorDiagnosticsForTests
} from './rendererErrorDiagnostics';

afterEach(() => {
  resetRendererErrorDiagnosticsForTests();
  logRuntimeError.mockReset();
});

it('logs uncaught window errors through the renderer diagnostic channel', () => {
  installRendererErrorDiagnostics();
  const error = new Error('render failed');

  window.dispatchEvent(
    new ErrorEvent('error', {
      colno: 4,
      error,
      filename: 'App.tsx',
      lineno: 12,
      message: 'render failed'
    })
  );

  expect(logRuntimeError).toHaveBeenCalledWith('window onerror', {
    action: 'window_onerror',
    area: 'bridge',
    column: 4,
    error,
    line: 12,
    source: 'App.tsx'
  });
});

it('logs unhandled rejections through the renderer diagnostic channel', () => {
  installRendererErrorDiagnostics();
  const reason = new Error('promise failed');

  const event = new Event('unhandledrejection') as PromiseRejectionEvent;
  Object.defineProperty(event, 'reason', { value: reason });
  window.dispatchEvent(event);

  expect(logRuntimeError).toHaveBeenCalledWith('unhandled rejection', {
    action: 'unhandled_rejection',
    area: 'bridge',
    reason: {
      message: 'promise failed',
      name: 'Error',
      stack: reason.stack
    }
  });
});

it('throttles repeated renderer errors with the same diagnostic action', () => {
  let now = 1_000;
  resetRendererErrorDiagnosticsForTests(() => now);
  installRendererErrorDiagnostics();

  window.dispatchEvent(new ErrorEvent('error', { message: 'first' }));
  window.dispatchEvent(new ErrorEvent('error', { message: 'second' }));

  expect(logRuntimeError).toHaveBeenCalledTimes(1);

  now += 10_000;
  window.dispatchEvent(new ErrorEvent('error', { message: 'third' }));

  expect(logRuntimeError).toHaveBeenCalledTimes(2);
});

it('does not throttle different renderer diagnostic actions together', () => {
  resetRendererErrorDiagnosticsForTests(() => 1_000);
  installRendererErrorDiagnostics();

  window.dispatchEvent(new ErrorEvent('error', { message: 'render failed' }));
  const event = new Event('unhandledrejection') as PromiseRejectionEvent;
  Object.defineProperty(event, 'reason', { value: new Error('promise failed') });
  window.dispatchEvent(event);

  expect(logRuntimeError).toHaveBeenCalledTimes(2);
  expect(logRuntimeError.mock.calls.map(([message]) => message)).toEqual([
    'window onerror',
    'unhandled rejection'
  ]);
});
