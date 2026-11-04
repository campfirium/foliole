// @vitest-environment node
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';
import { consumeCompanionFolderAttachmentWork } from '../folderBackup/consumeCompanionFolderAttachmentWork';

import { importCompanionArticleImage, recoverCompanionArticleImage } from './companionArticleImageRecovery';
import { importCompanionImageResource } from './companionImageImporter';
import { createSearchLibrary, reopenSearchLibrary } from './companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

const native = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), resolve: vi.fn() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), readRemoteImageResponse: native.read, writeImageAttachment: native.write, resolveAttachmentResource: native.resolve
  }) };
});

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
const bytes = Buffer.from(png, 'base64');
const key = createHash('sha256').update(bytes).digest('hex') + '.png';
const url = 'https://images.example/image.png';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let source: string;
let target: string;
const inventory = vi.fn();
const copy = vi.fn();
const owner = () => getIosCompanionDatabaseOwner();
const rows = () => owner().read(db => db.query<{ stage: string; last_error: string | null }>(
  'SELECT stage,last_error FROM folder_attachment_work'));
const runBackup = () => consumeCompanionFolderAttachmentWork({
  addListener: vi.fn(), openSource: vi.fn(), closeSource: vi.fn(), getState: vi.fn(),
  backupDatabase: vi.fn(), cancelDatabase: vi.fn(),
  prepareAttachmentDirectory: async () => {}, copyAttachment: copy,
  finishAttachments: async ({ pending, errorMessage }) => ({ configured: true, directoryId: 'profile',
    directoryLabel: 'Backup', databaseSavedAt: 'committed', phase: 'pending', attachmentFilesPending: pending, errorMessage })
} as CompanionFolderBackupPort, {
  write: task => owner().runWriter(task), inventory
}, { requestId: 'manual', sourceEpoch: 'owner', profile: 'profile' });

beforeEach(async () => {
  vi.resetAllMocks();
  library = await createSearchLibrary(0);
  source = path.join(library.root, 'attachments'); target = path.join(library.root, 'backup');
  await mkdir(source); await mkdir(target);
  native.resolve.mockResolvedValue({ status: 'missing' });
  native.read.mockResolvedValue({ status: 200, bytesBase64: png });
  native.write.mockImplementation(async ({ storageKey, bytesBase64 }) => {
    const file = path.join(source, storageKey);
    try { expect(await readFile(file)).toEqual(Buffer.from(bytesBase64, 'base64')); return { storedFile: 'reused' }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await writeFile(file, Buffer.from(bytesBase64, 'base64'));
    return { storedFile: 'created' };
  });
  inventory.mockImplementation(async () => ({ files: (await readdir(source)).map(storageKey => ({ storageKey, sizeBytes: bytes.length })) }));
  copy.mockImplementation(async ({ storageKey }) => {
    await copyFile(path.join(source, storageKey), path.join(target, storageKey));
    expect(await readFile(path.join(target, storageKey))).toEqual(bytes);
    return { copied: true };
  });
});
afterEach(async () => { await library.close(); });

it.each(['created', 'reused'])('records a %s remote image after the baseline and copies it without another inventory', async storedFile => {
  await runBackup();
  if (storedFile === 'reused') await writeFile(path.join(source, key), bytes);
  expect(await importCompanionImageResource(url)).toMatchObject({ storageKey: key, storedFile });
  expect(await rows()).toEqual([{ stage: 'backup', last_error: null }]);
  expect(await readdir(target)).toEqual([]);
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await readFile(path.join(target, key))).toEqual(bytes);
  expect(await rows()).toEqual([]);
  expect(inventory).toHaveBeenCalledTimes(1);
});

it('does not publish when durable registration fails, then succeeds through the original retry path', async () => {
  await runBackup();
  library.database.exec(`CREATE TRIGGER reject_intent BEFORE INSERT ON folder_attachment_work
    WHEN NEW.stage='source' BEGIN SELECT RAISE(ABORT,'registration unavailable'); END`);
  await expect(importCompanionImageResource(url)).rejects.toThrow('registration unavailable');
  expect(native.write).not.toHaveBeenCalled();
  expect(await readdir(source)).toEqual([]);
  library.database.exec('DROP TRIGGER reject_intent');
  await importCompanionImageResource(url);
  expect((await runBackup()).attachmentFilesPending).toBe(0);
});

it('recovers a published image after completion persistence fails and the library reopens', async () => {
  await runBackup();
  library.database.exec(`CREATE TRIGGER reject_ready BEFORE INSERT ON folder_attachment_work
    WHEN NEW.stage='backup' BEGIN SELECT RAISE(ABORT,'completion unavailable'); END`);
  await expect(importCompanionImageResource(url)).rejects.toThrow('completion unavailable');
  expect(await readFile(path.join(source, key))).toEqual(bytes);
  expect(await rows()).toEqual([{ stage: 'source', last_error: null }]);
  await reopenSearchLibrary(library.root, '2026-11-04T13:00:00Z');
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await readFile(path.join(target, key))).toEqual(bytes);
  expect(await rows()).toEqual([]);
  expect(native.write).toHaveBeenCalledTimes(1);
  expect(inventory).toHaveBeenCalledTimes(1);
});

it('retains a failed source intent and completes it when the original remote image import is retried', async () => {
  await runBackup();
  native.write.mockRejectedValueOnce(new Error('Original write unavailable'));
  await expect(importCompanionImageResource(url)).rejects.toThrow('Original write unavailable');
  expect(await rows()).toEqual([{ stage: 'source', last_error: null }]);
  expect((await runBackup()).attachmentFilesPending).toBe(1);
  await importCompanionImageResource(url);
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await readFile(path.join(target, key))).toEqual(bytes);
});

it('keeps the imported image usable when backup fails and retries after reopening', async () => {
  await runBackup();
  expect(await importCompanionImageResource(url)).toHaveProperty('storedFile', 'created');
  copy.mockRejectedValueOnce(new Error('Backup permission unavailable'));
  expect(await runBackup()).toMatchObject({ attachmentFilesPending: 1, errorMessage: 'Backup permission unavailable' });
  await expect(access(path.join(target, key))).rejects.toThrow();
  expect(await readFile(path.join(source, key))).toEqual(bytes);
  await reopenSearchLibrary(library.root, '2026-11-04T13:01:00Z');
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await rows()).toEqual([]);
});

it('backs up a published image even if its later article update fails', async () => {
  await runBackup();
  library.database.prepare('INSERT INTO nodes(id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run('article', 'Article', `![image](${url})`, 'now', 'now');
  library.database.exec("CREATE TRIGGER reject_article BEFORE UPDATE ON nodes BEGIN SELECT RAISE(ABORT,'article unavailable'); END");
  await expect(importCompanionArticleImage('article', url)).rejects.toThrow('article unavailable');
  expect(await rows()).toEqual([{ stage: 'backup', last_error: null }]);
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await readFile(path.join(target, key))).toEqual(bytes);
});

it('keeps normal imports before a configured directory and includes them in the first baseline', async () => {
  await importCompanionImageResource(url);
  expect(await rows()).toEqual([]);
  expect(copy).not.toHaveBeenCalled();
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await readFile(path.join(target, key))).toEqual(bytes);
});

it('persists an article image and copies the resource through the actual import entry', async () => {
  await runBackup();
  library.database.prepare('INSERT INTO nodes(id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run('article', 'Article', `![image](${url})`, 'now', 'now');
  expect(await importCompanionArticleImage('article', url)).toMatchObject({ stored_file: 'created' });
  const article = library.database.prepare('SELECT content FROM nodes WHERE id=?').get('article');
  expect(article).toEqual({ content: `![image](asset://${key})` });
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await readFile(path.join(target, key))).toEqual(bytes);
});

it('records a recovered missing article image even when the same hash needs no article update', async () => {
  await runBackup();
  const content = `![image](asset://${key})`;
  library.database.prepare('INSERT INTO nodes(id,title,content,image_sources,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run('article', 'Article', content, JSON.stringify({ [key]: url }), 'now', 'now');
  expect(await recoverCompanionArticleImage('article', key, content)).toEqual({ storageKey: key, content });
  expect(await rows()).toEqual([{ stage: 'backup', last_error: null }]);
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await readFile(path.join(target, key))).toEqual(bytes);
});

it('reuses an already published image on retry without losing its failed backup obligation', async () => {
  await runBackup();
  await importCompanionImageResource(url);
  copy.mockRejectedValueOnce(new Error('Backup unavailable'));
  expect((await runBackup()).attachmentFilesPending).toBe(1);
  native.read.mockResolvedValueOnce({ status: 404 });
  await expect(importCompanionImageResource(url)).rejects.toThrow('download_failed');
  expect(await rows()).toEqual([{ stage: 'backup', last_error: 'Backup unavailable' }]);
  expect(await importCompanionImageResource(url)).toHaveProperty('storedFile', 'reused');
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await rows()).toEqual([]);
  expect(inventory).toHaveBeenCalledTimes(1);
});

it('retains the older ready copy when a later import of the same image fails', async () => {
  await runBackup();
  await importCompanionImageResource(url);
  native.write.mockRejectedValueOnce(new Error('Later source unavailable'));
  await expect(importCompanionImageResource(url)).rejects.toThrow('Later source unavailable');
  expect((await rows()).map(row => row.stage).sort()).toEqual(['backup', 'source']);
  expect((await runBackup()).attachmentFilesPending).toBe(0);
  expect(await readFile(path.join(target, key))).toEqual(bytes);
  expect(await rows()).toEqual([]);
});
