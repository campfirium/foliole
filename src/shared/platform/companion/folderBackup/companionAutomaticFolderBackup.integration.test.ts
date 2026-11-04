// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { automaticFolderBackupFixture, closeAutomaticBackupFixtures, gate,
  clearCompanionFolderBackupDirectory, getCompanionAutomaticFolderBackup, setCompanionAutomaticFolderBackup,
  backUpCompanionDatabase, getCompanionFolderBackupState } from './companionAutomaticFolderBackup.testSupport';

const runtime = vi.hoisted(() => ({ owner: null as unknown, port: null as unknown, inventory: vi.fn(), resume: () => {} }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { maintainAttachmentFiles: runtime.inventory } }));
vi.mock('./companionFolderBackupRuntimeRepository', () => ({ supportsCompanionFolderDatabaseBackup: () => true,
  getCompanionFolderBackupPort: () => runtime.port }));
vi.mock('../../appLifecycle', () => ({ subscribeNativeAppForeground: async (listener: () => void) => {
  runtime.resume = listener; return () => { runtime.resume = () => {}; };
} }));


const fixture = () => automaticFolderBackupFixture(runtime);
afterEach(closeAutomaticBackupFixtures);

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
  await new Promise(done => setTimeout(done, 350)); expect(f.backup).toHaveBeenCalledTimes(failedRuns);
  const later = await f.publish('later pending original');
  await vi.waitFor(async () => expect(await f.readWork()).toEqual([]));
  f.copy.mockRejectedValueOnce(new Error('permission revoked again'));
  await f.publish('another failed original');
  await vi.waitFor(() => expect(f.state.errorMessage).toBe('permission revoked again'));
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

it('shows live unfinished work while automatic backup is off and retains its error after reopening', async () => {
  const f = await fixture(); await backUpCompanionDatabase();
  await f.publish('live pending');
  expect(f.state.attachmentFilesPending).toBe(0);
  expect((await getCompanionFolderBackupState()).attachmentFilesPending).toBe(1);
  f.copy.mockRejectedValueOnce(new Error('provider refused copy'));
  await backUpCompanionDatabase(); f.state.errorMessage = null;
  await f.reopen();
  expect(await getCompanionFolderBackupState()).toMatchObject({ attachmentFilesPending: 1, errorMessage: 'provider refused copy' });
});

it('disconnects after safely finishing an in-flight file, retains backups and work, then initializes a replacement folder once', async () => {
  const f = await fixture(); await backUpCompanionDatabase();
  const first = await f.publish('one retained original'), second = await f.publish('another retained original');
  const started = gate(), release = gate(); const originalCopy = f.copy.getMockImplementation()!;
  f.copy.mockImplementationOnce(async input => { started.release(); await release.promise; return originalCopy(input); });
  await setCompanionAutomaticFolderBackup(true); await started.promise;
  const clearing = clearCompanionFolderBackupDirectory();
  try {
    await vi.waitFor(async () => expect(await getCompanionAutomaticFolderBackup()).toBe(false));
    await expect(setCompanionAutomaticFolderBackup(true)).rejects.toThrow('being disconnected');
    expect(f.forget).not.toHaveBeenCalled(); const previousTarget = f.target;
    release.release(); await clearing;
    expect(f.forget).toHaveBeenCalledTimes(1); expect(await f.readWork()).toHaveLength(1);
    expect((await readdir(previousTarget)).filter(key => key.endsWith('.png'))).toHaveLength(1);
    const originalBackup = f.backup.getMockImplementation()!;
    f.backup.mockImplementationOnce(async input => { await f.select(); return originalBackup(input); });
    await backUpCompanionDatabase(true);
    expect(await readFile(path.join(f.target, first.key))).toEqual(first.bytes);
    expect(await readFile(path.join(f.target, second.key))).toEqual(second.bytes);
    const inventories = runtime.inventory.mock.calls.length;
    await backUpCompanionDatabase(); expect(runtime.inventory.mock.calls.length).toBe(inventories);
    expect((await readdir(previousTarget)).filter(key => key.endsWith('.png'))).toHaveLength(1);
    expect(await getCompanionAutomaticFolderBackup()).toBe(false);
  } finally { release.release(); await clearing.catch(() => undefined); }
});

it('persists the latest concurrent switch choice without starting a stale enabled request', async () => {
  const f = await fixture();
  await Promise.all([setCompanionAutomaticFolderBackup(true), setCompanionAutomaticFolderBackup(false)]);
  expect(await getCompanionAutomaticFolderBackup()).toBe(false);
  await new Promise(done => setTimeout(done, 250)); expect(f.backup).not.toHaveBeenCalled();
});

it('preserves the old directory, pending work and disabled setting when folder selection is cancelled', async () => {
  const f = await fixture(); await backUpCompanionDatabase(); const item = await f.publish('waiting across cancellation');
  f.backup.mockImplementationOnce(async ({ requestId }) => ({ requestId, cancelled: true, databaseCommitted: false, state: { ...f.state } }));
  expect((await backUpCompanionDatabase(true)).cancelled).toBe(true);
  expect(await f.readWork()).toHaveLength(1); expect(await getCompanionAutomaticFolderBackup()).toBe(false);
  expect(f.state.directoryId).toBe('target'); await backUpCompanionDatabase();
  expect(await readFile(path.join(f.target, item.key))).toEqual(item.bytes);
});

it('keeps an existing background reading snapshot alive through backup bookkeeping writes', async () => {
  const f = await fixture(); const started = gate(), release = gate();
  const baseline = await f.owner.read(db => db.query('SELECT count(*) AS count FROM nodes'));
  const reading = f.owner.readBackgroundSnapshot(async db => {
    await db.query('SELECT count(*) AS count FROM nodes'); started.release(); await release.promise;
    return db.query('SELECT count(*) AS count FROM nodes');
  });
  const outcome = reading.then(value => ({ value }), error => ({ error: String(error) }));
  try {
    await started.promise;
    await f.owner.runWriter(db => db.run("INSERT INTO companion_meta(key,value,updated_at) VALUES ('backup-status','saved','now')"), false);
    release.release(); expect(await outcome).toEqual({ value: baseline });
  } finally { release.release(); await outcome; }
});
