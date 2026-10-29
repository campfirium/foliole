// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('node:worker_threads', async importOriginal => {
  const actual = await importOriginal<typeof import('node:worker_threads')>();
  return { ...actual, Worker: class extends actual.Worker {
    constructor(url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(url.pathname.endsWith('/attachmentReferenceWorker.js')
        ? path.resolve('dist/electron/attachments/attachmentReferenceWorker.js') : url, options);
    }
  } };
});

const moveGate = vi.hoisted(() => ({ moved: null as null | (() => void) }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs')
}) }));
vi.mock('electron', () => ({ BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null } }));
vi.mock('../ipc/assistantCommands.js', () => ({ handleAssistantCommand: vi.fn() }));
vi.mock('../ipc/importCommands.js', () => ({ handleImportCommand: vi.fn() }));
vi.mock('../ipc/reviewCommands.js', () => ({ handleReviewCommand: vi.fn() }));
vi.mock('../ipc/updateCommands.js', () => ({ handleDesktopUpdateCommand: vi.fn() }));
vi.mock('../ipc/windowCommands.js', () => ({ handleWindowAndUtilityCommand: vi.fn() }));
vi.mock('../ipc/storageCommands.js', () => ({
  handleStorageCommand: (_command: string, args: { storage_key: string }) => resolveAttachmentResource(args.storage_key)
}));
vi.mock('./attachmentTrashFiles.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./attachmentTrashFiles.js')>();
  return { ...actual, moveAttachmentToTrash(assetsDir: string, key: string) {
    actual.moveAttachmentToTrash(assetsDir, key);
    moveGate.moved?.();
  } };
});

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { closeDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';
import { handleInvokeRequest } from '../ipc/commands.js';

import { runDesktopAttachmentMaintenance } from './attachmentMaintenanceService.js';
import { attachmentFileAvailable } from './attachmentTrashFiles.js';
import { resolveAttachmentResource } from './resourceResolver.js';

beforeEach(async () => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-read-cleanup-'));
  moveGate.moved = null;
  await initializeDatabase();
});

afterEach(() => {
  closeDatabaseConnection();
  fs.rmSync(appData, { recursive: true, force: true });
});

it.each(['current-dispatch', 'previous-outer-owner'] as const)(
  '%s preserves bytes and completes cleanup when a resource request arrives after the move', async mode => {
    const { assetsDir } = resolveRuntimeDataPaths();
    const bytes = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const storageKey = `${createHash('sha256').update(bytes).digest('hex')}.png`;
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, storageKey), bytes);
    await runDesktopAttachmentMaintenance({ action: 'configure',
      settings: { automatic: false, observationThreshold: 1 } });
    await runDesktopAttachmentMaintenance({ action: 'observe' });
    const moved = new Promise<void>(resolve => { moveGate.moved = resolve; });
    // Register outside the maintenance owner so the request is an independent caller.
    const reading = moved.then(() => {
      const invoke = () => handleInvokeRequest({ command: NATIVE_COMMANDS.resolveAttachmentResource,
        args: { storage_key: storageKey } });
      return mode === 'previous-outer-owner' ? runWithDatabaseConnectionOwner(invoke) : invoke();
    });
    await expect(runDesktopAttachmentMaintenance({ action: 'clean' })).resolves.toBeDefined();
    await expect(reading).resolves.toMatchObject({ status: 'ready' });
    expect(fs.readFileSync(path.join(assetsDir, storageKey))).toEqual(bytes);
    expect(attachmentFileAvailable(assetsDir, storageKey)).toBe(true);
  }
);
