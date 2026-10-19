// @vitest-environment node
import { setImmediate } from 'node:timers/promises';

import { expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

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

it('allows database work while the Readwise join decision waits for a peer', async () => {
  let finishNetwork!: () => void;
  let markRequested!: () => void;
  const network = new Promise<void>(resolve => { finishNetwork = resolve; });
  const requested = new Promise<void>(resolve => { markRequested = resolve; });
  handleStorageCommand.mockImplementation(async (command: string) => {
    if (command !== NATIVE_COMMANDS.resolveReadwiseJoinDecision) return 'workspace';
    await runWithDatabaseConnectionOwner(() => 'local assignment');
    markRequested();
    await network;
    return runWithDatabaseConnectionOwner(() => ({ kind: 'none', devices: [] }));
  });
  const decision = handleInvokeRequest({ command: NATIVE_COMMANDS.resolveReadwiseJoinDecision });
  await requested;
  let completed = false;
  const read = handleInvokeRequest({ command: NATIVE_COMMANDS.loadWorkspaceListSnapshot })
    .then(value => { completed = true; return value; });
  try {
    await setImmediate();
    expect(completed).toBe(true);
  } finally {
    finishNetwork();
    await expect(decision).resolves.toEqual({ kind: 'none', devices: [] });
    await expect(read).resolves.toBe('workspace');
  }
});
