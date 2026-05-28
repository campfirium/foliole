import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

const { getRuntimeInvoke } = vi.hoisted(() => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('./runtimeInvoke', () => ({ getRuntimeInvoke }));

import { copyDiagnosticReport } from './diagnosticBundle';

beforeEach(() => {
  getRuntimeInvoke.mockReset();
});

it('loads a diagnostic report through the desktop runtime', async () => {
  const invoke = vi.fn().mockResolvedValue({
    report_text: '# Foliole Diagnostic Report',
    status: 'generated'
  });
  getRuntimeInvoke.mockReturnValue(invoke);

  await expect(copyDiagnosticReport()).resolves.toEqual({
    reportText: '# Foliole Diagnostic Report',
    status: 'generated'
  });
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.copyDiagnosticReport);
});

it('returns unavailable outside the desktop runtime', async () => {
  getRuntimeInvoke.mockReturnValue(null);

  await expect(copyDiagnosticReport()).resolves.toEqual({
    reportText: null,
    status: 'unavailable'
  });
});
