import { expect, it, vi } from 'vitest';

import { createStartupErrorActions, resolveStartupView } from './startupViewMode';

const platformMocks = vi.hoisted(() => ({
  closeMainWindow: vi.fn(),
  exportDiagnosticBundle: vi.fn(),
  openLocalPath: vi.fn(),
  restartMainWindowApp: vi.fn()
}));

vi.mock('./shared/platform/bridge', () => ({
  openLocalPath: platformMocks.openLocalPath
}));

vi.mock('./shared/platform/diagnosticBundle', () => ({
  exportDiagnosticBundle: platformMocks.exportDiagnosticBundle
}));

vi.mock('./shared/platform/windowControls', () => ({
  closeMainWindow: platformMocks.closeMainWindow,
  restartMainWindowApp: platformMocks.restartMainWindowApp
}));

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

it('routes startup error actions through startup platform abilities', () => {
  platformMocks.restartMainWindowApp.mockResolvedValue(undefined);
  platformMocks.openLocalPath.mockResolvedValue(undefined);
  platformMocks.exportDiagnosticBundle.mockResolvedValue({ status: 'exported' });
  platformMocks.closeMainWindow.mockResolvedValue(undefined);

  const actions = createStartupErrorActions({
    logPath: '/logs',
    reportActionFailure: vi.fn()
  });

  actions.retry?.();
  actions.openLogs?.();
  actions.exportDiagnostics?.();
  actions.exit?.();

  expect(platformMocks.restartMainWindowApp).toHaveBeenCalledOnce();
  expect(platformMocks.openLocalPath).toHaveBeenCalledWith('/logs');
  expect(platformMocks.exportDiagnosticBundle).toHaveBeenCalledOnce();
  expect(platformMocks.closeMainWindow).toHaveBeenCalledOnce();
});
