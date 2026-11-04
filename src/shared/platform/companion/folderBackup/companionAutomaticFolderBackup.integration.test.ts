// @vitest-environment node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { completeFolderAttachmentCopy, prepareFolderAttachmentCopy } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import { bindCompanionAutomaticFolderBackup, getCompanionAutomaticFolderBackup, setCompanionAutomaticFolderBackup } from './companionAutomaticFolderBackup';
import { backUpCompanionDatabase } from './companionFolderBackup';

const runtime = vi.hoisted(() => ({ owner: null as unknown, port: null as unknown, inventory: vi.fn(), resume: () => {} }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { maintainAttachmentFiles: runtime.inventory } }));
vi.mock('./companionFolderBackupRuntimeRepository', () => ({ supportsCompanionFolderDatabaseBackup: () => true,
  getCompanionFolderBackupPort: () => runtime.port }));
vi.mock('../../appLifecycle', () => ({ subscribeNativeAppForeground: async (listener: () => void) => {
  runtime.resume = listener; return () => { runtime.resume = () => {}; };
} }));

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
function gate() { let release!: () => void; const promise = new Promise<void>(done => { release = done; }); return { promise, release }; }
async function fixture() {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/T692/automatic-'));
  const source = path.join(root, 'source'), target = path.join(root, 'target'); await mkdir(source); await mkdir(target);
  let library = createDisplayLibrary('android');
  await library.owner.open({ expectedHostName: 'fixture', now: '2026-11-04T00:00:00Z' });
  const sourceDb = path.join(root, 'source.sqlite');
  let stop = () => {};
  let inBackup = 0, maxInBackup = 0;
  const state = { configured: true, directoryLabel: 'Backup', directoryId: 'target', databaseSavedAt: null as string | null,
    phase: 'idle' as const, errorMessage: null as string | null, attachmentFilesPending: null as number | null };
  const backup = vi.fn(async ({ requestId }: { requestId: string }) => {
    inBackup++; maxInBackup = Math.max(maxInBackup, inBackup);
    try {
      const sqlite = new Database(library.file, { readonly: true });
      try { await sqlite.backup(path.join(target, 'Foliole.sqlite')); } finally { sqlite.close(); }
      state.databaseSavedAt = new Date().toISOString();
      return { requestId, cancelled: false, databaseCommitted: true, state: { ...state } };
    } finally { inBackup--; }
  });
  const copy = vi.fn(async ({ storageKey }: { storageKey: string }) => {
    const bytes = await readFile(path.join(source, storageKey));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(storageKey.slice(0, 64));
    await copyFile(path.join(source, storageKey), path.join(target, storageKey)); return { copied: true };
  });
  const finish = vi.fn(async (input: { pending: number | null; errorMessage: string | null }) => {
    state.attachmentFilesPending = input.pending; state.errorMessage = input.errorMessage; return { ...state };
  });
  runtime.port = { getState: async () => ({ ...state }), openSource: async () => {}, closeSource: async () => {},
    backupDatabase: backup, prepareAttachmentDirectory: async () => {}, copyAttachment: copy, finishAttachments: finish,
    cancelDatabase: async () => {} } as unknown as CompanionFolderBackupPort;
  runtime.inventory.mockImplementation(async ({ trash }: { trash: boolean }) => ({ files: trash ? [] :
    (await readdir(source)).map(storageKey => ({ storageKey, sizeBytes: 0 })) }));
  async function bind() { runtime.owner = library.owner; stop = await bindCompanionAutomaticFolderBackup(library.owner); }
  await bind();
  cleanup.push(async () => { stop(); await library.close(); await rm(root, { recursive: true, force: true }); });
  const publish = async (text: string) => {
    const bytes = Buffer.from(text), key = `${createHash('sha256').update(bytes).digest('hex')}.png`;
    await library.owner.runWriter(db => prepareFolderAttachmentCopy(db, key));
    await writeFile(path.join(source, key), bytes);
    await library.owner.runWriter(db => db.transaction(tx => completeFolderAttachmentCopy(tx, key)));
    return { key, bytes };
  };
  const reopen = async () => {
    stop(); const sqlite = new Database(library.file, { readonly: true });
    try { await sqlite.backup(sourceDb); } finally { sqlite.close(); }
    await library.close(); library = createDisplayLibrary('android', sourceDb);
    await library.owner.open({ expectedHostName: 'fixture', now: '2026-11-04T00:00:00Z' }); await bind();
  };
  return { source, target, state, backup, copy, finish, publish, reopen, get owner() { return library.owner; },
    maxInBackup: () => maxInBackup, readWork: () => library.owner.read(db => db.query('SELECT * FROM folder_attachment_work')) };
}

it('defaults off despite an authorized folder, catches up on enable and recovers automatically after reopening', async () => {
  const f = await fixture(); expect(await getCompanionAutomaticFolderBackup()).toBe(false);
  await backUpCompanionDatabase(); const initial = f.backup.mock.calls.length;
  const item = await f.publish('published while disabled');
  await new Promise(done => setTimeout(done, 250)); expect(f.backup).toHaveBeenCalledTimes(initial);
  expect(await f.readWork()).toHaveLength(1);
  await setCompanionAutomaticFolderBackup(true);
  await vi.waitFor(async () => expect(await readFile(path.join(f.target, item.key))).toEqual(item.bytes));
  await vi.waitFor(async () => expect(await f.readWork()).toEqual([]));
  await f.reopen(); expect(await getCompanionAutomaticFolderBackup()).toBe(true);
  const next = await f.publish('after reopen');
  await vi.waitFor(async () => expect(await readFile(path.join(f.target, next.key))).toEqual(next.bytes));
  await vi.waitFor(async () => expect(await f.readWork()).toEqual([]));
  const settled = f.backup.mock.calls.length;
  await new Promise(done => setTimeout(done, 350)); expect(f.backup).toHaveBeenCalledTimes(settled);
});

it('stops claiming after disabling while letting one in-flight file finish, then catches up on re-enable', async () => {
  const f = await fixture(); await backUpCompanionDatabase();
  const first = await f.publish('first off'), second = await f.publish('second off');
  const started = gate(), release = gate(); const original = f.copy.getMockImplementation()!;
  f.copy.mockImplementationOnce(async input => { started.release(); await release.promise; return original(input); });
  await setCompanionAutomaticFolderBackup(true); await started.promise;
  try {
    await setCompanionAutomaticFolderBackup(false);
    await f.owner.runWriter(db => db.run("INSERT INTO nodes(id,title,content,created_at,updated_at) VALUES ('interactive','Still responsive','','now','now')"));
    release.release(); await vi.waitFor(() => expect(f.finish).toHaveBeenLastCalledWith(expect.objectContaining({ pending: 1 })));
    expect(f.copy).toHaveBeenCalledTimes(1); expect(await getCompanionAutomaticFolderBackup()).toBe(false);
    await setCompanionAutomaticFolderBackup(true);
    await vi.waitFor(async () => expect(await f.readWork()).toEqual([]));
    expect(await readFile(path.join(f.target, first.key))).toEqual(first.bytes);
    expect(await readFile(path.join(f.target, second.key))).toEqual(second.bytes);
    expect(f.maxInBackup()).toBe(1);
  } finally { release.release(); }
});

it('persists file errors without retrying on bookkeeping, and retries on foreground with later changes intact', async () => {
  const f = await fixture(); await backUpCompanionDatabase();
  const item = await f.publish('permission failure'); f.copy.mockRejectedValueOnce(new Error('permission revoked'));
  await setCompanionAutomaticFolderBackup(true);
  await vi.waitFor(() => expect(f.state.errorMessage).toBe('permission revoked'));
  expect((await f.readWork())[0]).toMatchObject({ last_error: 'permission revoked' });
  const failedRuns = f.backup.mock.calls.length;
  const later = await f.publish('later pending original');
  await new Promise(done => setTimeout(done, 350)); expect(f.backup).toHaveBeenCalledTimes(failedRuns);
  runtime.resume(); await vi.waitFor(async () => expect(await f.readWork()).toEqual([]));
  expect(await readFile(path.join(f.target, item.key))).toEqual(item.bytes);
  expect(await readFile(path.join(f.target, later.key))).toEqual(later.bytes);
});

it('serializes manual work behind an automatic file and saves changes committed during that file', async () => {
  const f = await fixture(); await backUpCompanionDatabase(); await f.publish('initial in-flight file');
  const started = gate(), release = gate(); const original = f.copy.getMockImplementation()!;
  f.copy.mockImplementationOnce(async input => { started.release(); await release.promise; return original(input); });
  await setCompanionAutomaticFolderBackup(true); await started.promise;
  const calls = f.backup.mock.calls.length;
  const manual = backUpCompanionDatabase();
  try {
    const later = await f.publish('new original while copying');
    await f.owner.runWriter(db => db.run("INSERT INTO nodes(id,title,content,created_at,updated_at) VALUES ('late','Later fact','','now','now')"));
    expect(f.backup).toHaveBeenCalledTimes(calls);
    release.release(); await manual;
    await vi.waitFor(async () => expect(await f.readWork()).toEqual([]));
    expect(await readFile(path.join(f.target, later.key))).toEqual(later.bytes);
    const target = new Database(path.join(f.target, 'Foliole.sqlite'), { readonly: true });
    try { expect(target.prepare("SELECT title FROM nodes WHERE id='late'").get()).toEqual({ title: 'Later fact' }); }
    finally { target.close(); }
    expect(f.maxInBackup()).toBe(1);
  } finally { release.release(); await manual.catch(() => undefined); }
});

it('never opens a picker automatically and retains the previous preference if persistence fails', async () => {
  const f = await fixture(); f.state.configured = false;
  await expect(setCompanionAutomaticFolderBackup(true)).rejects.toThrow('Choose a backup folder first.');
  expect(f.backup).not.toHaveBeenCalled(); expect(await getCompanionAutomaticFolderBackup()).toBe(false);
  f.state.configured = true;
  await f.owner.runWriter(db => db.run(`CREATE TRIGGER refuse_automatic BEFORE INSERT ON companion_meta
    WHEN NEW.key='folder_backup_automatic' BEGIN SELECT RAISE(ABORT,'setting write refused'); END`));
  await expect(setCompanionAutomaticFolderBackup(true)).rejects.toThrow('setting write refused');
  expect(await getCompanionAutomaticFolderBackup()).toBe(false); expect(f.backup).not.toHaveBeenCalled();
  await f.owner.runWriter(db => db.run('DROP TRIGGER refuse_automatic'));
  await setCompanionAutomaticFolderBackup(true); await vi.waitFor(() => expect(f.finish).toHaveBeenCalled());
});
