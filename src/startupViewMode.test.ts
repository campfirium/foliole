import { expect, it, vi } from 'vitest';

import { createStartupErrorActions, resolveStartupView } from './startupViewMode';

it('parses startup error view parameters', () => {
  expect(
    resolveStartupView(
      '?startupView=startup-error&startupModule=Database+migration&startupError=migration+failed&startupLogPath=%2Flogs'
    )
  ).toEqual({
    errorSummary: 'migration failed',
    kind: 'startup-error',
    logPath: '/logs',
    moduleLabel: 'Database migration'
  });
});

it('routes startup error actions through native commands', () => {
  const runtimeInvoke = vi.fn().mockResolvedValue(null);
  const actions = createStartupErrorActions({
    getRuntimeInvoke: () => runtimeInvoke,
    logPath: '/logs',
    reportActionFailure: vi.fn()
  });

  actions.retry?.();
  actions.openLogs?.();
  actions.exportDiagnostics?.();
  actions.exit?.();

  expect(runtimeInvoke).toHaveBeenNthCalledWith(1, 'window_restart_app', undefined);
  expect(runtimeInvoke).toHaveBeenNthCalledWith(2, 'open_local_path', { path: '/logs' });
  expect(runtimeInvoke).toHaveBeenNthCalledWith(3, 'export_diagnostic_bundle', undefined);
  expect(runtimeInvoke).toHaveBeenNthCalledWith(4, 'window_close', undefined);
});
