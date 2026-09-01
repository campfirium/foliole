// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

const { handleStorageCommand, runWithDatabaseConnectionOwner } = vi.hoisted(() => ({
  handleStorageCommand: vi.fn(),
  runWithDatabaseConnectionOwner: vi.fn((execute: () => unknown) => execute())
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null)
  }
}));
vi.mock('../database/connection.js', () => ({ runWithDatabaseConnectionOwner }));
vi.mock('../database/databaseReadiness.js', () => ({ waitForDatabaseReady: vi.fn() }));
vi.mock('./assistantCommands.js', () => ({ handleAssistantCommand: vi.fn() }));
vi.mock('./importCommands.js', () => ({ handleImportCommand: vi.fn() }));
vi.mock('./reviewCommands.js', () => ({ handleReviewCommand: vi.fn() }));
vi.mock('./storageCommands.js', () => ({ handleStorageCommand }));
vi.mock('./updateCommands.js', () => ({ handleDesktopUpdateCommand: vi.fn() }));
vi.mock('./windowCommands.js', () => ({ handleWindowAndUtilityCommand: vi.fn() }));

import { handleInvokeRequest } from './commands.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('queues storage commands behind the active database owner', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  runWithDatabaseConnectionOwner.mockImplementationOnce(async (execute: () => unknown) => {
    await waiting;
    return execute();
  });
  handleStorageCommand.mockResolvedValue('workspace');

  const result = handleInvokeRequest({ command: NATIVE_COMMANDS.loadWorkspaceListSnapshot });
  await Promise.resolve();
  expect(handleStorageCommand).not.toHaveBeenCalled();

  release();
  await expect(result).resolves.toBe('workspace');
  expect(handleStorageCommand).toHaveBeenCalledTimes(1);
});

it.each([
  NATIVE_COMMANDS.completeSyncGroupJoin,
  NATIVE_COMMANDS.syncCompanionNow
])('keeps internally coordinated network command %s outside the outer owner', async (command) => {
  handleStorageCommand.mockResolvedValue('completed');

  await expect(handleInvokeRequest({ command })).resolves.toBe('completed');

  expect(runWithDatabaseConnectionOwner).not.toHaveBeenCalled();
  expect(handleStorageCommand).toHaveBeenCalledTimes(1);
});
