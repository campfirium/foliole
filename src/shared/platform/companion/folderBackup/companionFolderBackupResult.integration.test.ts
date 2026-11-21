// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { COMPANION_FOLDER_ATTACHMENT_COPY_BATCH, type CompanionFolderBackupPort,
  type CompanionFolderBackupState } from '../../../../../lib/platform/companionFolderBackupContract';

import { folderAttachmentWorkFixture } from './companionFolderAttachmentWork.testSupport';
import { backUpCompanionDatabase } from './companionFolderBackup';
import { getCompanionFolderBackupState, subscribeCompanionFolderBackupWork } from './companionFolderBackupState';

const runtime = vi.hoisted(() => ({ access: vi.fn(), inventory: vi.fn(), owner: null as unknown, port: null as unknown }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  accessFramedSyncFile: runtime.access, maintainAttachmentFiles: runtime.inventory
} }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner }));
vi.mock('./companionFolderBackupRuntimeRepository', () => ({ getCompanionFolderBackupPort: () => runtime.port }));

const fixtures: Awaited<ReturnType<typeof folderAttachmentWorkFixture>>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); vi.clearAllMocks(); });

/** The durable profile follows the Android plugin: `working` is persisted before the database round,
 * commit records savedAt, finishAttachments writes the final phase, and a reload turns `working` into the interrupted retry. */
async function fixture() {
  const f = await folderAttachmentWorkFixture({ access: runtime.access }, createBetterSqliteDbPort);
  fixtures.push(f); await f.run();
  runtime.owner = { read: f.host.write, readBackgroundSnapshot: f.host.write,
    runWriter: f.host.write, folderBackupSource: async () => 'owner',
    // Backup bookkeeping never reaches committed-write observers in the real owner.
    committedWrites: { subscribe: () => () => undefined } };
  runtime.inventory.mockImplementation(f.inventory);
  const durable = { phase: 'idle' as CompanionFolderBackupState['phase'], savedAt: null as string | null,
    error: null as string | null, pending: null as number | null };
  let commits = 0;
  const state = (): CompanionFolderBackupState => ({ configured: true, directoryId: 'profile', directoryLabel: 'Backup',
    databaseSavedAt: durable.savedAt, phase: durable.phase, errorMessage: durable.error, attachmentFilesPending: durable.pending });
  const backupDatabase = vi.fn(async ({ requestId }: { requestId: string }) => {
    durable.phase = 'working'; durable.error = null;
    await f.sqlite.backup(path.join(f.target, 'Foliole.sqlite'));
    durable.savedAt = `commit ${++commits}`; durable.pending = null;
    return { requestId, cancelled: false, databaseCommitted: true, sourcePages: 1, changedPages: 1, state: state() };
  });
  const finishAttachments = vi.fn(async (input: { pending: number | null; errorMessage: string | null }) => {
    durable.pending = input.pending; durable.error = input.errorMessage;
    durable.phase = input.errorMessage ? 'failed' : input.pending === 0 ? 'saved' : 'pending';
    return state();
  });
  const cancelDatabase = vi.fn(async () => undefined);
  runtime.port = { ...f.port, backupDatabase, finishAttachments, cancelDatabase,
    getState: async () => state() } as unknown as CompanionFolderBackupPort;
  const reload = () => {
    if (durable.phase === 'working') { durable.phase = 'pending'; durable.error = 'Backup interrupted. Use Back up now to retry.'; }
  };
  return { f, durable, backupDatabase, finishAttachments, cancelDatabase, reload };
}

it('reopens a completed backup as saved with no remaining work', async () => {
  const { f, durable, reload } = await fixture();
  const item = await f.receive('completed attachment');
  expect((await backUpCompanionDatabase()).state).toMatchObject({ phase: 'saved', pendingItems: 0, errorMessage: null });
  reload();
  expect(durable.phase).toBe('saved');
  expect(await getCompanionFolderBackupState()).toMatchObject({ phase: 'saved', pendingItems: 0, databaseSavedAt: 'commit 1' });
  expect(await readFile(item.file)).toEqual(item.bytes);
});

it('ends a committed round as failed when confirming it locally fails, keeping savedAt and the unstarted attachment', async () => {
  const { f, durable, finishAttachments, cancelDatabase, reload } = await fixture();
  const item = await f.receive('attachment after the database round');
  f.sqlite.exec(`CREATE TRIGGER refuse_confirm BEFORE INSERT ON companion_meta
    WHEN NEW.key='folder_backup_saved_revision' BEGIN SELECT RAISE(ABORT,'confirm write refused'); END`);
  await expect(backUpCompanionDatabase()).rejects.toThrow('confirm write refused');
  expect(finishAttachments).toHaveBeenCalledTimes(1);
  expect(finishAttachments).toHaveBeenCalledWith(expect.objectContaining({ copied: 0, pending: null, errorMessage: 'confirm write refused' }));
  expect(finishAttachments.mock.invocationCallOrder[0]).toBeLessThan(cancelDatabase.mock.invocationCallOrder[0]!);
  expect(f.port.copyAttachment).not.toHaveBeenCalledWith(expect.objectContaining({ storageKey: item.key }));
  expect(await f.exists(item.file)).toBe(false);
  // Reopening keeps the real failure instead of regenerating the generic interruption.
  reload();
  expect(await getCompanionFolderBackupState()).toMatchObject({ phase: 'failed', errorMessage: 'confirm write refused',
    databaseSavedAt: 'commit 1', attachmentFilesPending: 1, pendingItems: 2 });
  expect(durable.phase).toBe('failed');
  f.sqlite.exec('DROP TRIGGER refuse_confirm');
  expect((await backUpCompanionDatabase()).state).toMatchObject({ phase: 'saved', pendingItems: 0, errorMessage: null, databaseSavedAt: 'commit 2' });
  expect(await readFile(item.file)).toEqual(item.bytes);
});

it('keeps the previous backup and attachment work when the database round fails before committing', async () => {
  const { f, durable, backupDatabase, finishAttachments, cancelDatabase } = await fixture();
  await backUpCompanionDatabase();
  const item = await f.receive('waiting behind a failed round');
  finishAttachments.mockClear();
  backupDatabase.mockImplementationOnce(async () => {
    durable.phase = 'failed'; durable.error = 'Cannot read backup directory.';
    throw new Error('Cannot read backup directory.');
  });
  await expect(backUpCompanionDatabase()).rejects.toThrow('Cannot read backup directory.');
  expect(finishAttachments).not.toHaveBeenCalled();
  expect(cancelDatabase).toHaveBeenCalledTimes(1);
  // The earlier committed database stays confirmed; only the received attachment remains.
  expect(await getCompanionFolderBackupState()).toMatchObject({ phase: 'failed', databaseSavedAt: 'commit 1',
    attachmentFilesPending: 1, pendingItems: 1 });
  expect(await f.exists(item.file)).toBe(false);
});

it('retries an interrupted round into the same folder after reopening', async () => {
  const { f, durable, backupDatabase, reload } = await fixture();
  const item = await f.receive('interrupted attachment');
  durable.phase = 'working';
  reload();
  expect(await getCompanionFolderBackupState()).toMatchObject({ phase: 'pending',
    errorMessage: 'Backup interrupted. Use Back up now to retry.', attachmentFilesPending: 1 });
  expect((await backUpCompanionDatabase()).state).toMatchObject({ phase: 'saved', pendingItems: 0, errorMessage: null });
  expect(backupDatabase).toHaveBeenCalledWith(expect.objectContaining({ chooseDirectory: false }));
  expect(await readFile(item.file)).toEqual(item.bytes);
});

it('announces the shrinking pending count to the settings page while attachment batches are still copying', async () => {
  const { f } = await fixture();
  await backUpCompanionDatabase();
  const total = COMPANION_FOLDER_ATTACHMENT_COPY_BATCH + 1;
  for (let index = 0; index < total; index++) await f.receive(`progress attachment ${index}`);
  const observed: number[] = [];
  let reads: Promise<void> = Promise.resolve();
  const unsubscribe = subscribeCompanionFolderBackupWork(() => {
    reads = reads.then(async () => {
      const { pendingItems, phase } = await getCompanionFolderBackupState();
      if (phase === 'working' && pendingItems != null) observed.push(pendingItems);
    });
  });
  try {
    expect((await backUpCompanionDatabase()).state).toMatchObject({ phase: 'saved', pendingItems: 0 });
    await reads;
  } finally { unsubscribe(); }
  // After the database round and the first full batch, only the last attachment is still pending.
  expect(observed).toContain(total);
  expect(observed).toContain(1);
});
