// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { automaticFolderBackupFixture, closeAutomaticBackupFixtures, setCompanionAutomaticFolderBackup } from './companionAutomaticFolderBackup.testSupport';

const runtime = vi.hoisted(() => ({ owner: null as unknown, port: null as unknown, inventory: vi.fn(), resume: () => {}, pause: () => {} }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { maintainAttachmentFiles: runtime.inventory } }));
vi.mock('./companionFolderBackupRuntimeRepository', () => ({ supportsCompanionFolderDatabaseBackup: () => true,
  getCompanionFolderBackupPort: () => runtime.port }));
vi.mock('../../appLifecycle', () => ({
  subscribeNativeAppForeground: async (listener: () => void) => { runtime.resume = listener; return () => { runtime.resume = () => {}; }; },
  subscribeNativeAppBackground: async (listener: () => void) => { runtime.pause = listener; return () => { runtime.pause = () => {}; }; }
}));

afterEach(closeAutomaticBackupFixtures);

type Fixture = Awaited<ReturnType<typeof automaticFolderBackupFixture>>;
async function enabledFixture(quietMs: number) {
  const f = await automaticFolderBackupFixture(runtime, { startMs: 150, quietMs, maxWaitMs: 60_000 });
  await setCompanionAutomaticFolderBackup(true);
  await vi.waitFor(() => expect(f.backup).toHaveBeenCalled());
  await new Promise(done => setTimeout(done, 400));
  return f;
}

async function commitNodes(f: Fixture, count: number, gapMs = 0) {
  for (let i = 0; i < count; i++) {
    await new Promise(done => setTimeout(done, gapMs));
    await f.owner.runWriter(db => db.run('INSERT INTO nodes(id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)',
      [`burst-${i}`, `Burst ${i}`, '', 'now', 'now']));
  }
}

function backedUpNodes(f: Fixture) {
  const db = new Database(path.join(f.target, 'Foliole.sqlite'), { readonly: true });
  try { return (db.prepare("SELECT count(*) AS n FROM nodes WHERE id LIKE 'burst-%'").get() as { n: number }).n; }
  finally { db.close(); }
}

it('backs up a burst of commits once after they pause, with every commit and file in the backup', async () => {
  const f = await enabledFixture(400);
  const before = f.backup.mock.calls.length;
  // Spaced commits let a per-commit worker start several rounds; a coalescing worker waits for the pause.
  await commitNodes(f, 12, 100);
  const item = await f.publish('file in the burst');
  await vi.waitFor(async () => expect(await f.readWork()).toEqual([]), { timeout: 3_000 });
  await new Promise(done => setTimeout(done, 600));
  expect(f.backup.mock.calls.length - before).toBe(1);
  expect(backedUpNodes(f)).toBe(12);
  expect(await readFile(path.join(f.target, item.key))).toEqual(item.bytes);
});

it('starts the coalesced backup as soon as the App leaves the foreground', async () => {
  const f = await enabledFixture(60_000);
  const before = f.backup.mock.calls.length;
  await commitNodes(f, 3);
  await new Promise(done => setTimeout(done, 400));
  expect(f.backup).toHaveBeenCalledTimes(before);
  runtime.pause();
  await vi.waitFor(() => expect(f.backup).toHaveBeenCalledTimes(before + 1), { timeout: 1_000 });
  await vi.waitFor(() => expect(backedUpNodes(f)).toBe(3));
});
