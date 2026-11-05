// @vitest-environment node
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { CompanionFolderBackupPort } from '../../lib/platform/companionFolderBackupContract';
import type { NativeCompanionFramedFileRequest } from '../../lib/platform/nativeCompanionFramedFilesContract';
import { companionEpubBook } from '../../tests/fixtures/companionEpubBook';
import { consumeCompanionFolderAttachmentWork } from '../shared/platform/companion/folderBackup/consumeCompanionFolderAttachmentWork';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { companionAttachmentNativeFiles } from '../shared/platform/companion/sync/framed/companionAttachmentNativeFiles.testSupport';

import { createCompanionFileImportHandler } from './companionFileImportActions';

const native = vi.hoisted(() => ({ access: null as null | ((input: NativeCompanionFramedFileRequest) => Promise<unknown>),
  publications: 0, failPublication: 0 }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), accessFramedSyncFile: async (input: NativeCompanionFramedFileRequest) => {
      if (input.operation === 'remove') return {};
      if (input.operation === 'attachment' && input.action === 'publish' && ++native.publications === native.failPublication) {
        throw new Error('Original publication unavailable');
      }
      return native.access!(input);
    }
  }) };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let source: string, target: string;
const inventory = vi.fn();
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function copyAttachment({ storageKey }: { storageKey: string }) {
  const output = path.join(target, storageKey);
  try {
    expect(digest(await readFile(output))).toBe(storageKey.slice(0, 64));
    return { copied: false };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await copyFile(path.join(source, storageKey), output);
  expect(digest(await readFile(output))).toBe(storageKey.slice(0, 64));
  return { copied: true };
}
const port = {
  prepareAttachmentDirectory: vi.fn(async () => undefined),
  copyAttachment: vi.fn(copyAttachment),
  finishAttachments: vi.fn(async (result: { pending: number | null; errorMessage: string | null }) => ({
    configured: true, directoryId: 'profile', directoryLabel: 'Backup', databaseSavedAt: 'database committed',
    phase: 'pending' as const, attachmentFilesPending: result.pending, errorMessage: result.errorMessage
  }))
};
beforeEach(async () => {
  vi.clearAllMocks(); native.publications = 0; native.failPublication = 0;
  port.copyAttachment.mockReset().mockImplementation(copyAttachment);
  inventory.mockReset();
  library = await createSearchLibrary(0);
  source = path.join(library.root, 'attachments'); target = path.join(library.root, 'backup');
  await mkdir(source); await mkdir(target);
  native.access = companionAttachmentNativeFiles(source);
  inventory.mockImplementation(async () => ({ files: (await sourceFiles()).map(storageKey => ({ storageKey, sizeBytes: 0 })) }));
});
afterEach(async () => { await library.close(); });
const sourceFiles = async () => (await readdir(source)).filter(key => /^[a-f0-9]{64}\.(png|jpg|gif|webp|pdf|epub|pdftext)$/.test(key)).sort();
const rows = () => getIosCompanionDatabaseOwner().read(db => db.query<{ storage_key: string; stage: string }>(
  'SELECT storage_key,stage FROM folder_attachment_work ORDER BY storage_key,stage'));
const runBackup = () => consumeCompanionFolderAttachmentWork(port as unknown as CompanionFolderBackupPort, {
  write: task => getIosCompanionDatabaseOwner().runWriter(task), inventory
}, { requestId: 'manual-request', sourceEpoch: 'owner', profile: 'profile' });
async function importFile(kind: 'pdf' | 'epub', failRefresh = false) {
  const bytes = kind === 'pdf' ? await readFile('tests/desktop/fixtures/pdf-user-journey.pdf') : companionEpubBook();
  return createCompanionFileImportHandler({ refreshAfterMutation: async () => {
    if (failRefresh) throw new Error('List refresh failed');
    return null;
  } })(new File([Uint8Array.from(bytes)], `Reading.${kind}`));
}

it.each(['pdf', 'epub'] as const)('backs up a local %s import after the baseline without another directory inventory', async kind => {
  await runBackup();
  expect(await importFile(kind)).toHaveProperty('nodeId');
  const keys = await sourceFiles();
  expect(keys.length).toBeGreaterThan(0);
  expect(await rows()).toEqual(keys.map(storage_key => ({ storage_key, stage: 'backup' })));
  expect(await readdir(target)).toEqual([]);
  await runBackup();
  for (const key of keys) expect(await readFile(path.join(target, key))).toEqual(await readFile(path.join(source, key)));
  expect(await rows()).toEqual([]);
  expect(inventory).toHaveBeenCalledTimes(1);
});

it.each(['pdf', 'epub'] as const)('retains published %s resources through failed metadata and backs them up after reopen', async kind => {
  await runBackup();
  library.database.exec("CREATE TRIGGER reject_import BEFORE INSERT ON import_runs BEGIN SELECT RAISE(ABORT,'metadata unavailable'); END");
  expect(await importFile(kind)).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 0 });
  const keys = await sourceFiles();
  expect(keys.length).toBeGreaterThan(0);
  expect(await rows()).toEqual(keys.map(storage_key => ({ storage_key, stage: 'source' })));
  await reopenSearchLibrary(library.root, '2026-11-04T12:00:00Z');
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  for (const key of keys) expect(await readFile(path.join(target, key))).toEqual(await readFile(path.join(source, key)));
  expect(await rows()).toEqual([]);
  expect(inventory).toHaveBeenCalledTimes(1);
});

it('preserves an EPUB resource published before a later resource fails, then completes the same import and backup', async () => {
  await runBackup(); native.failPublication = 2;
  expect(await importFile('epub')).toEqual({ error: 'save-failed' });
  const completed = await sourceFiles();
  expect(completed.length).toBeGreaterThan(0);
  expect((await rows()).length).toBeGreaterThan(completed.length);
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 0 });
  expect((await runBackup()).attachmentFilesPending).toBe(1);
  for (const key of completed) expect(await readFile(path.join(target, key))).toEqual(await readFile(path.join(source, key)));
  native.failPublication = 0;
  expect(await importFile('epub')).toHaveProperty('nodeId');
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  for (const key of await sourceFiles()) expect(await readFile(path.join(target, key))).toEqual(await readFile(path.join(source, key)));
  expect(await rows()).toEqual([]);
  expect(inventory).toHaveBeenCalledTimes(1);
});

it('does not publish an original or create its topic when durable intent registration fails', async () => {
  await runBackup();
  library.database.exec(`CREATE TRIGGER reject_registration BEFORE INSERT ON folder_attachment_work
    WHEN NEW.stage='source' BEGIN SELECT RAISE(ABORT,'registration unavailable'); END`);
  expect(await importFile('pdf')).toEqual({ error: 'save-failed' });
  expect(native.publications).toBe(0); expect(await sourceFiles()).toEqual([]);
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 0 });
  library.database.exec('DROP TRIGGER reject_registration');
  expect(await importFile('pdf')).toHaveProperty('nodeId');
  expect((await runBackup()).attachmentFilesPending).toBe(0);
});

it('leaves a successful local import intact when its later backup fails, and retries after reopening', async () => {
  await runBackup();
  expect(await importFile('pdf')).toHaveProperty('nodeId');
  const [key] = await sourceFiles();
  port.copyAttachment.mockRejectedValueOnce(new Error('Backup directory permission unavailable'));
  expect(await runBackup()).toMatchObject({ attachmentFilesPending: 1, errorMessage: 'Backup directory permission unavailable' });
  await expect(access(path.join(target, key!))).rejects.toThrow();
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 1 });
  await reopenSearchLibrary(library.root, '2026-11-04T12:01:00Z');
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await readFile(path.join(target, key!))).toEqual(await readFile(path.join(source, key!)));
  expect(await rows()).toEqual([]);
});

it('keeps backup work ready when only the post-import list refresh fails', async () => {
  await runBackup();
  const result = await importFile('pdf', true);
  expect(result).toHaveProperty('nodeId'); expect(result).toHaveProperty('retryRefresh');
  expect((await rows()).every(row => row.stage === 'backup')).toBe(true);
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await rows()).toEqual([]);
});

it('imports without retaining backup work before any directory is configured, then seeds it on the first manual backup', async () => {
  expect(await importFile('pdf')).toHaveProperty('nodeId');
  expect(await rows()).toEqual([]);
  expect(port.copyAttachment).not.toHaveBeenCalled();
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  for (const key of await sourceFiles()) expect(await readFile(path.join(target, key))).toEqual(await readFile(path.join(source, key)));
});
