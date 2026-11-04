import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/companionSchemaStatements';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { RequestSyncDatabaseHost } from '../../../../../lib/core/sync/requestSyncObjectEndpoint';
import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';
import type { NativeCompanionFramedFileRequest } from '../../../../../lib/platform/nativeCompanionFramedFilesContract';
import { createCompanionAttachmentHost } from '../sync/framed/companionAttachmentBlockFiles';
import { companionAttachmentNativeFiles } from '../sync/framed/companionAttachmentNativeFiles.testSupport';

import { companionFolderAttachmentRecorder } from './companionFolderAttachmentRecorder';
import { consumeCompanionFolderAttachmentWork } from './consumeCompanionFolderAttachmentWork';

export const attachmentDigest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function folderAttachmentWorkFixture(native: {
  access: { mockImplementation(execute: (input: NativeCompanionFramedFileRequest) => Promise<unknown>): unknown };
}, createPort: (sqlite: Database.Database) => DbPort) {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/T692/durable-work-'));
  const directory = path.join(root, 'source'), target = path.join(root, 'target');
  await mkdir(directory); await mkdir(target);
  const databasePath = path.join(root, 'source.sqlite');
  let sqlite = new Database(databasePath);
  for (const statement of COMPANION_SCHEMA_STATEMENTS) sqlite.exec(statement);
  let db = createPort(sqlite);
  const host = {
    readSnapshot: async <T>(read: (port: typeof db) => Promise<T>) => read(db),
    write: async <T>(write: (port: typeof db) => Promise<T>) => write(db)
  } as RequestSyncDatabaseHost;
  const owner = { library_key: root, generation_id: 'generation' };
  native.access.mockImplementation(companionAttachmentNativeFiles(directory));
  const makeReceiver = () => createCompanionAttachmentHost(host, owner, companionFolderAttachmentRecorder(host));
  let receiver = await makeReceiver();
  const inventory = vi.fn(async () => ({ files: (await readdir(directory))
    .filter(key => /^[a-f0-9]{64}\.png$/.test(key)).map(storageKey => ({ storageKey, sizeBytes: 0 })) }));
  const copy = async ({ storageKey }: { storageKey: string }) => {
    const file = path.join(target, storageKey), expected = storageKey.slice(0, 64);
    const source = path.join(directory, storageKey);
    if (attachmentDigest(await readFile(source)) !== expected) throw new Error('source checksum mismatch');
    try {
      if (attachmentDigest(await readFile(file)) !== expected) throw new Error('target changed externally');
      return { copied: false };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await copyFile(source, `${file}.partial`);
    if (attachmentDigest(await readFile(`${file}.partial`)) !== expected) throw new Error('copy checksum mismatch');
    await rename(`${file}.partial`, file);
    return { copied: true };
  };
  const port = {
    prepareAttachmentDirectory: vi.fn(async () => undefined),
    copyAttachment: vi.fn(copy),
    finishAttachments: vi.fn(async (input: { copied: number; pending: number | null; errorMessage: string | null }) => ({
      configured: true, directoryId: 'profile', directoryLabel: 'Backup', databaseSavedAt: 'database committed',
      phase: 'pending' as const, errorMessage: input.errorMessage,
      attachmentFilesCopied: input.copied, attachmentFilesPending: input.pending
    }))
  };
  const run = (profile = 'profile') => consumeCompanionFolderAttachmentWork(port as unknown as CompanionFolderBackupPort,
    { write: host.write, inventory }, { profile, requestId: 'request', sourceEpoch: 'owner' });
  const receive = async (text: string) => {
    const bytes = Buffer.from(text), key = `${attachmentDigest(bytes)}.png`;
    await receiver.receive({ storageKey: key, byteLength: bytes.length }, 0, bytes);
    return { key, bytes, file: path.join(target, key), source: path.join(directory, key) };
  };
  return {
    root, directory, target, host, receive, inventory, port, copy, run,
    get sqlite() { return sqlite; }, get db() { return db; },
    suspend() { sqlite.close(); },
    async reopen() { if (sqlite.open) sqlite.close(); sqlite = new Database(databasePath); db = createPort(sqlite); receiver = await makeReceiver(); },
    rows: () => sqlite.prepare('SELECT * FROM folder_attachment_work ORDER BY storage_key,stage').all(),
    exists: async (file: string) => { try { await access(file); return true; } catch { return false; } },
    async close() { if (sqlite.open) sqlite.close(); await rm(root, { recursive: true, force: true }); }
  };
}
