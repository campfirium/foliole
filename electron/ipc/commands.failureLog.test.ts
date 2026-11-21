// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resetNativeCommandFailureLogForTests } from '../diagnostics/nativeCommandFailureLog.js';

import { handleInvokeRequest } from './commands.js';

const { appendDiagnosticLog, handleWindowAndUtilityCommand } = vi.hoisted(() => ({
  appendDiagnosticLog: vi.fn(async () => undefined),
  handleWindowAndUtilityCommand: vi.fn()
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: { fromWebContents: vi.fn(() => null), getFocusedWindow: vi.fn(() => null) }
}));
vi.mock('../diagnostics/diagnosticLog.js', () => ({ appendDiagnosticLog }));
vi.mock('./reminderNotificationCommands.js', () => ({ handleReminderNotificationCommand: () => undefined }));
vi.mock('./windowCommands.js', () => ({ handleWindowAndUtilityCommand }));

const command = NATIVE_COMMANDS.copyDiagnosticReport;

beforeEach(() => {
  appendDiagnosticLog.mockClear();
  handleWindowAndUtilityCommand.mockReset();
  resetNativeCommandFailureLogForTests();
});

it('records a failed native command with its error and still rejects the caller', async () => {
  const failure = Object.assign(new Error('EPERM: operation not permitted, open /Volumes/Books/a.epub'), { code: 'EPERM' });
  handleWindowAndUtilityCommand.mockRejectedValue(failure);

  await expect(handleInvokeRequest({ command })).rejects.toBe(failure);

  expect(appendDiagnosticLog).toHaveBeenCalledTimes(1);
  expect(appendDiagnosticLog).toHaveBeenCalledWith(expect.objectContaining({
    event: 'native_command_failed',
    level: 'warn',
    payload: { command, error: { code: 'EPERM', message: failure.message, name: 'Error' } },
    source: 'electron.main'
  }));
});

it('does not record commands that complete, including cancelled pickers that return null', async () => {
  handleWindowAndUtilityCommand.mockResolvedValue(null);

  await expect(handleInvokeRequest({ command })).resolves.toBeNull();

  expect(appendDiagnosticLog).not.toHaveBeenCalled();
});

it('records a repeating identical failure once per minute so it cannot flood the daily log', async () => {
  handleWindowAndUtilityCommand.mockRejectedValue(new Error('offline'));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(handleInvokeRequest({ command })).rejects.toThrow('offline');
  }

  expect(appendDiagnosticLog).toHaveBeenCalledTimes(1);
});
