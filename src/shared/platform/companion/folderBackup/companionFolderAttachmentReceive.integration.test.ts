// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/companionSchemaStatements';
import type { NativeCompanionFramedFileRequest } from '../../../../../lib/platform/nativeCompanionFramedFilesContract';
import { currentCompanionAttachmentHost } from '../sync/framed/companionAttachmentBlockFiles';
import { companionAttachmentNativeFiles } from '../sync/framed/companionAttachmentNativeFiles.testSupport';

const native = vi.hoisted(() => ({ access: vi.fn<(input: NativeCompanionFramedFileRequest) => Promise<unknown>>(), owner: {} }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { accessFramedSyncFile: native.access } }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => native.owner }));
vi.mock('../runtime/companionFramedPayloadBudget', () => ({
  companionFramedFileOwner: () => ({ library_key: 'library', generation_id: 'generation' })
}));

const roots: string[] = [];
const databases: Database.Database[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) if (db.open) db.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

async function fixture() {
  await mkdir(path.resolve('.tmp/artifacts/T692'), { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/T692/receive-work-'));
  roots.push(root);
  const directory = path.join(root, 'attachments');
  await mkdir(directory);
  const sqlite = new Database(path.join(root, 'source.sqlite'));
  databases.push(sqlite);
  for (const statement of COMPANION_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.prepare('INSERT INTO companion_meta VALUES (?,?,?)')
    .run('folder_attachment_backup_profile', 'profile', 'now');
  const db = createBetterSqliteDbPort(sqlite);
  const host = { readSnapshot: async <T>(read: (port: typeof db) => Promise<T>) => read(db),
    write: async <T>(write: (port: typeof db) => Promise<T>) => write(db),
    files: { exclusive: async <T>(_key: string, execute: () => Promise<T>) => execute() } };
  native.owner = {};
  const operations = companionAttachmentNativeFiles(directory);
  native.access.mockImplementation(operations);
  const receiver = await currentCompanionAttachmentHost(host as never);
  const bytes = Buffer.from('a verified original attachment');
  const key = `${createHash('sha256').update(bytes).digest('hex')}.png`;
  const resource = { storageKey: key, byteLength: bytes.length };
  const rows = () => {
    if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='folder_attachment_work'").get()) return [];
    return sqlite.prepare('SELECT storage_key,stage,action,last_error FROM folder_attachment_work').all();
  };
  return { root, directory, sqlite, db, host, receiver, bytes, key, resource, rows, operations };
}

it('records a verified synchronous receive durably without needing a directory inventory', async () => {
  const f = await fixture();
  await f.receiver.receive(f.resource, 0, f.bytes);
  expect(await readFile(path.join(f.directory, f.key))).toEqual(f.bytes);
  expect(f.rows()).toEqual([{ storage_key: f.key, stage: 'backup', action: 'copy', last_error: null }]);
  expect(native.access.mock.calls.some(([input]) => input.operation === 'attachment' && input.action === 'source-stat-batch')).toBe(false);
});

it('retains the durable source intent when publication succeeds but the original completion transaction fails', async () => {
  const f = await fixture();
  f.sqlite.exec(`CREATE TRIGGER reject_completion BEFORE INSERT ON folder_attachment_work
    WHEN NEW.stage='backup' BEGIN SELECT RAISE(ABORT,'completion interrupted'); END`);
  const session = await f.receiver.openReceiveSession!({ shouldYield: () => false });
  try {
    await session.receiveWindow(f.resource, 0, async () => {
      await f.operations({ operation: 'attachment', action: 'append', library_key: 'library', generation_id: 'generation',
        key: f.key.slice(0, 64), offset: 0, base64: f.bytes.toString('base64') });
      return { offset: f.bytes.length, blocks: 1, pending: false };
    });
    await expect(session.settled(f.key)).rejects.toThrow('completion interrupted');
    expect(await readFile(path.join(f.directory, f.key))).toEqual(f.bytes);
    expect(f.rows()).toEqual([{ storage_key: f.key, stage: 'source', action: 'copy', last_error: null }]);
    f.sqlite.exec('DROP TRIGGER reject_completion');
    // Re-enter the production complete-file branch: publication is not called a second time.
    native.access.mockClear();
    expect(await f.receiver.status(f.resource)).toEqual({ kind: 'complete', offset: f.bytes.length });
    expect(f.rows()).toEqual([{ storage_key: f.key, stage: 'backup', action: 'copy', last_error: null }]);
    expect(native.access.mock.calls.some(([input]) => input.operation === 'attachment' && input.action === 'publish')).toBe(false);
  } finally { await session.close(); }
});

it('does not publish a new file if durable registration fails, and retries the original receiver', async () => {
  const f = await fixture();
  f.sqlite.exec(`CREATE TRIGGER reject_registration BEFORE INSERT ON folder_attachment_work
    WHEN NEW.stage='source' BEGIN SELECT RAISE(ABORT,'registration unavailable'); END`);
  await expect(f.receiver.receive(f.resource, 0, f.bytes)).rejects.toThrow('registration unavailable');
  await expect(access(path.join(f.directory, f.key))).rejects.toThrow();
  expect(native.access.mock.calls.some(([input]) => input.operation === 'attachment' && input.action === 'publish')).toBe(false);
  f.sqlite.exec('DROP TRIGGER reject_registration');
  await f.receiver.receive(f.resource, 0, f.bytes);
  expect(await readFile(path.join(f.directory, f.key))).toEqual(f.bytes);
  expect(f.rows()[0]).toMatchObject({ stage: 'backup', action: 'copy' });
});

it('does not replace an older valid backup obligation when the new source publication fails', async () => {
  const f = await fixture();
  f.sqlite.prepare('INSERT INTO folder_attachment_work VALUES (?,?,?,?,?)')
    .run(f.key, 'backup', 'copy', 'older-obligation', 'previous failure');
  native.access.mockImplementation(async (input: NativeCompanionFramedFileRequest) => {
    if (input.operation === 'attachment' && input.action === 'publish') throw new Error('native publication failed');
    return f.operations(input);
  });
  await expect(f.receiver.receive(f.resource, 0, f.bytes)).rejects.toThrow('native publication failed');
  expect(f.sqlite.prepare("SELECT token,last_error FROM folder_attachment_work WHERE stage='backup'").get())
    .toEqual({ token: 'older-obligation', last_error: 'previous failure' });
  expect(f.rows()).toHaveLength(2);
  native.access.mockImplementation(f.operations);
  await f.receiver.receive(f.resource, 0, f.bytes);
  expect(f.rows()).toEqual([{ storage_key: f.key, stage: 'backup', action: 'copy', last_error: null }]);
});

it('does not retain a backup obligation before a backup directory has ever been configured', async () => {
  const f = await fixture();
  f.sqlite.prepare('DELETE FROM companion_meta WHERE key=?').run('folder_attachment_backup_profile');
  await f.receiver.receive(f.resource, 0, f.bytes);
  expect(await readFile(path.join(f.directory, f.key))).toEqual(f.bytes);
  expect(f.rows()).toEqual([]);
});
