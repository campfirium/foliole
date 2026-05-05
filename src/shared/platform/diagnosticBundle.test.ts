import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

const { getRuntimeInvoke } = vi.hoisted(() => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('./runtimeInvoke', () => ({ getRuntimeInvoke }));

import { exportDiagnosticBundle } from './diagnosticBundle';

beforeEach(() => {
  getRuntimeInvoke.mockReset();
});

it('exports a diagnostic bundle through the desktop runtime', async () => {
  const invoke = vi.fn().mockResolvedValue({
    file_path: '/Desktop/foliole-diagnostics.zip',
    included_file_count: 2,
    status: 'exported'
  });
  getRuntimeInvoke.mockReturnValue(invoke);

  await expect(exportDiagnosticBundle()).resolves.toEqual({
    filePath: '/Desktop/foliole-diagnostics.zip',
    includedFileCount: 2,
    status: 'exported'
  });
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.exportDiagnosticBundle);
});

it('returns unavailable outside the desktop runtime', async () => {
  getRuntimeInvoke.mockReturnValue(null);

  await expect(exportDiagnosticBundle()).resolves.toEqual({
    filePath: null,
    includedFileCount: 0,
    status: 'unavailable'
  });
});
