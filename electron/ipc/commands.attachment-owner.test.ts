// @vitest-environment node
import { setImmediate } from 'node:timers/promises';

import { expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { handleInvokeRequest } from './commands.js';

const { handleStorageCommand } = vi.hoisted(() => ({ handleStorageCommand: vi.fn() }));

vi.mock('electron', () => ({ BrowserWindow: {
  fromWebContents: () => null, getFocusedWindow: () => null
} }));
vi.mock('../database/connection.js', async () => {
  const { SqliteConnectionCoordinator } = await import('../database/sqliteConnectionCoordinator.js');
  const coordinator = new SqliteConnectionCoordinator();
  return { runWithDatabaseConnectionOwner: (execute: () => unknown) => coordinator.runExclusive(execute) };
});
vi.mock('../database/databaseReadiness.js', () => ({ waitForDatabaseReady: async () => undefined }));
vi.mock('./assistantCommands.js', () => ({ handleAssistantCommand: vi.fn() }));
vi.mock('./importCommands.js', () => ({ handleImportCommand: vi.fn() }));
vi.mock('./reviewCommands.js', () => ({ handleReviewCommand: vi.fn() }));
vi.mock('./storageCommands.js', () => ({ handleStorageCommand }));
vi.mock('./updateCommands.js', () => ({ handleDesktopUpdateCommand: vi.fn() }));
vi.mock('./windowCommands.js', () => ({ handleWindowAndUtilityCommand: vi.fn() }));

it('lets database work finish while attachment verification is pending', async () => {
  let finishAttachment!: () => void;
  let markRequested!: () => void;
  const pending = new Promise<void>(resolve => { finishAttachment = resolve; });
  const requested = new Promise<void>(resolve => { markRequested = resolve; });
  handleStorageCommand.mockImplementation(async (command: string) => {
    if (command !== NATIVE_COMMANDS.resolveAttachmentResource) return 'workspace';
    markRequested();
    await pending;
    return { status: 'ready' };
  });
  const attachment = handleInvokeRequest({ command: NATIVE_COMMANDS.resolveAttachmentResource });
  await requested;
  let completed = false;
  const read = handleInvokeRequest({ command: NATIVE_COMMANDS.loadWorkspaceListSnapshot })
    .then(value => { completed = true; return value; });
  try {
    await setImmediate();
    expect(completed).toBe(true);
  } finally {
    finishAttachment();
    await expect(attachment).resolves.toEqual({ status: 'ready' });
    await expect(read).resolves.toBe('workspace');
  }
});
