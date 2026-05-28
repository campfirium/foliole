import { expect, it, vi } from 'vitest';

import { createStartupErrorActions, resolveStartupView } from './startupViewMode';

const platformMocks = vi.hoisted(() => ({
  closeMainWindow: vi.fn(),
  copyDiagnosticReport: vi.fn(),
  openLocalPath: vi.fn(),
  restartMainWindowApp: vi.fn()
}));

vi.mock('./shared/platform/bridge', () => ({
  openLocalPath: platformMocks.openLocalPath
}));

vi.mock('./shared/platform/diagnosticBundle', () => ({
  copyDiagnosticReport: platformMocks.copyDiagnosticReport
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
  platformMocks.copyDiagnosticReport.mockResolvedValue({
    reportText: '# Foliole Diagnostic Report',
    status: 'generated'
  });
  platformMocks.closeMainWindow.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  });

  const actions = createStartupErrorActions({
    logPath: '/logs',
    reportActionFailure: vi.fn()
  });

  actions.retry?.();
  actions.openLogs?.();
  actions.copyDiagnostics?.();
  actions.exit?.();

  return vi.waitFor(() => {
    expect(platformMocks.restartMainWindowApp).toHaveBeenCalledOnce();
    expect(platformMocks.openLocalPath).toHaveBeenCalledWith('/logs');
    expect(platformMocks.copyDiagnosticReport).toHaveBeenCalledOnce();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# Foliole Diagnostic Report');
    expect(platformMocks.closeMainWindow).toHaveBeenCalledOnce();
  });
});
