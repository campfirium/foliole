// @vitest-environment node
import { spawn } from 'node:child_process';
import { symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { build } from 'vite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { hydrateCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';

import { companionDailyFlowSettings, loadCompanionDailySession, openCompanionDailyFlow } from './companionDailyFlow';
import { getCompanionReadIntents } from './companionReadIntents';
import { createSearchLibrary, reopenSearchLibrary } from './companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(now));
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  library = await createSearchLibrary(70, 32);
  library.database.prepare('UPDATE nodes SET created_at=?,updated_at=?').run(now, now);
});
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await library.close(); });

async function ready() {
  const session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  const engine = await getCompanionReadIntents();
  return { session, engine };
}

it.each([false, true])('recovers a durably accepted click from a SIGKILLed process and commits it exactly once (quoted source path=%s)', async quotedSourcePath => {
  const { session, engine } = await ready();
  const intent = { id: crypto.randomUUID(), libraryId: engine.journal.libraryId, nodeId: session.currentNodeId!,
    now, dayKey: session.daily!.dayKey, mode: 'recommended', historyKey: 'kill-history', predecessor: null,
    settings: companionDailyFlowSettings() };
  const journalFile = path.join(library.root, `foliole-read-intents-${intent.libraryId}.db`);
  const bundle = path.join(library.root, 'accept.cjs');
  const entry = path.join(library.root, 'accept.ts');
  const sourceRoot = quotedSourcePath ? path.join(library.root, "source's-files") : process.cwd();
  if (quotedSourcePath) await symlink(process.cwd(), sourceRoot, 'junction');
  await writeFile(entry, `
      import Database from 'better-sqlite3';
      import { ReadIntentJournal } from ${JSON.stringify(path.join(sourceRoot, 'lib/core/flow/readIntentJournal.ts'))};
      import { createCapacitorSqliteDbPort } from ${JSON.stringify(path.join(sourceRoot, 'src/shared/platform/capacitorSqliteDbPort.ts'))};
      import { createFakeCapacitorConnection } from ${JSON.stringify(path.join(sourceRoot, 'src/shared/platform/companionSyncNodeVersionsTestSupport.ts'))};
      const database = new Database(${JSON.stringify(journalFile)});
      const journal = new ReadIntentJournal(createCapacitorSqliteDbPort(createFakeCapacitorConnection(database), 'android'), ${JSON.stringify(intent.libraryId)});
      (async () => { await journal.initialize(); await journal.accept(${JSON.stringify(intent)});
        process.stdout.write('accepted\\n'); setInterval(() => {}, 1000); })().catch(error => { console.error(error); process.exit(1); });
    `);
  await build({ configFile: false, logLevel: 'silent', build: { ssr: entry, outDir: library.root, emptyOutDir: false,
    rolldownOptions: { external: id => !id.startsWith('.') && !path.isAbsolute(id),
      output: { format: 'cjs', entryFileNames: 'accept.cjs' } } } });
  const child = spawn(process.execPath, [bundle], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: path.join(process.cwd(), 'node_modules') } });
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', reject); child.once('close', (_code, signal) => signal === 'SIGKILL' ? resolve() : reject(new Error('child exited before kill')));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      let output = '';
      child.stdout.on('data', data => { output += String(data); if (output.includes('accepted\n')) resolve(); });
      child.stderr.on('data', data => reject(new Error(String(data))));
      child.once('error', reject);
    });
    child.kill('SIGKILL'); await exited;
    await reopenSearchLibrary(library.root, now);
    const recovered = await getCompanionReadIntents();
    await recovered.drain();
    expect((await recovered.journal.rows(false)).find(row => row.intent.id === intent.id)?.state).toBe('applied');
    const owner = getIosCompanionDatabaseOwner();
    expect(await owner.read(db => db.query('SELECT repetition_count FROM node_reading WHERE node_id=?', [intent.nodeId])))
      .toEqual([{ repetition_count: 1 }]);
    expect(await owner.read(db => db.query('SELECT count FROM topic_daily_counts'))).toEqual([{ count: 1 }]);
    await recovered.restore(); await recovered.drain();
    expect(await owner.read(db => db.query('SELECT count(*) AS n FROM daily_flow_operations'))).toEqual([{ n: 1 }]);
  } finally {
    child.kill('SIGKILL'); await exited.catch(() => undefined);
    if (quotedSourcePath) await unlink(sourceRoot);
  }
});

it('drains accepted operations before closing and gives a replacement library a different identity', async () => {
  const { engine, session } = await ready();
  await engine.accept({ session, now, mode: 'recommended', historyKey: 'exit-history' });
  const id = engine.journal.libraryId;
  await reopenSearchLibrary(library.root, now);
  const recovered = await getCompanionReadIntents();
  expect(recovered.journal.libraryId).toBe(id);
  expect(recovered.pending).toBe(false);
  expect((await loadCompanionDailySession())?.currentNodeId).not.toBe(session.currentNodeId);
  expect((await recovered.journal.rows(false)).map(row => row.state)).toEqual(['applied']);
  await expect(engine.accept({ session, now, mode: 'recommended', historyKey: 'exit-history' })).rejects.toThrow('closed');
  const replacement = await createSearchLibrary(2, 32);
  try { expect((await getCompanionReadIntents()).journal.libraryId).not.toBe(id); }
  finally { await replacement.close(); }
});

it('refills the display beyond two selector batches without waiting for the first learning transaction', async () => {
  const { engine, session } = await ready();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const held = getIosCompanionDatabaseOwner().runWriter(db => db.transaction(async () => { await waiting; }));
  let display = session;
  const targets: string[] = [];
  try {
    for (let index = 0; index < 66; index += 1) {
      targets.push(display.currentNodeId!);
      await engine.displayPreparation.prepare({ session: display, now, mode: 'recommended' });
      const reads = vi.spyOn(getIosCompanionDatabaseOwner(), 'readInteractiveSnapshot')
        .mockRejectedValue(new Error('unexpected_click_time_selection'));
      try {
        display = (await engine.accept({ session: display, now, mode: 'recommended', historyKey: 'window-history' })).session;
        expect(reads).not.toHaveBeenCalled();
      } finally { reads.mockRestore(); }
    }
    expect(new Set(targets).size).toBe(66);
    expect(display.currentNodeId).toBe('000066');
    expect((await engine.journal.rows()).length).toBe(66);
    expect(library.database.prepare('SELECT count(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
    release(); await held; await engine.drain();
    expect(engine.error).toBeNull();
    expect((await loadCompanionDailySession())?.currentNodeId).toBe(display.currentNodeId);
    expect(library.database.prepare('SELECT count FROM topic_daily_counts').get()).toEqual({ count: 66 });
  } finally { release(); await held; }
});

it('does not resurrect A from a borrowed old snapshot after A and B have already committed', async () => {
  library.database.prepare("DELETE FROM nodes WHERE id>'000002'").run();
  const { engine, session } = await ready();
  const owner = getIosCompanionDatabaseOwner();
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const held = owner.readSnapshot(async db => {
    await db.query('SELECT revision FROM daily_flow_state'); entered(); await waiting;
  });
  await started;
  try {
    let display = session;
    for (const expected of ['000001', '000002', null]) {
      display = (await engine.accept({ session: display, now, mode: 'recommended', historyKey: 'borrowed-history' })).session;
      expect(display.currentNodeId).toBe(expected);
      await engine.drain();
    }
    expect((await loadCompanionDailySession())?.currentNodeId).toBeNull();
    expect(library.database.prepare('SELECT count FROM topic_daily_counts').get()).toEqual({ count: 3 });
  } finally { release(); await held; }
});

it('records an old-day unprepared click as superseded without resetting the new day or redirecting its target', async () => {
  const { engine, session } = await ready();
  await engine.journal.accept({ id: crypto.randomUUID(), libraryId: engine.journal.libraryId,
    nodeId: session.currentNodeId!, dayKey: session.daily!.dayKey, now, mode: 'recommended',
    historyKey: 'old-day-history', predecessor: null, settings: companionDailyFlowSettings() });
  await openCompanionDailyFlow({ now: '2026-10-27T08:00:00.000Z', mode: 'recommended' });
  const today = await loadCompanionDailySession();
  await engine.restore();
  await expect(engine.drain()).rejects.toThrow('changed');
  expect((await engine.journal.rows(false)).map(row => [row.state, row.intent.nodeId])).toEqual([['superseded', session.currentNodeId]]);
  expect(await loadCompanionDailySession()).toEqual(today);
  expect(library.database.prepare('SELECT count(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
});

it('keeps click time and learning day when processing crosses midnight', async () => {
  const { engine, session } = await ready();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const held = getIosCompanionDatabaseOwner().runWriter(async () => { await waiting; });
  try {
    const b = (await engine.accept({ session, now, mode: 'recommended', historyKey: 'midnight-history' })).session;
    await engine.accept({ session: b, now: '2026-10-26T08:00:01.000Z', mode: 'recommended', historyKey: 'midnight-history' });
    vi.setSystemTime(new Date('2026-10-27T08:00:00.000Z'));
    release(); await held; await engine.drain();
    expect(library.database.prepare('SELECT last_handled_at FROM node_reading ORDER BY node_id').all())
      .toEqual([{ last_handled_at: now }, { last_handled_at: '2026-10-26T08:00:01.000Z' }]);
    expect(library.database.prepare('SELECT day_key,count FROM topic_daily_counts').all()).toEqual([{ day_key: '2026-10-26', count: 2 }]);
    await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'recommended' });
    expect((await loadCompanionDailySession())?.daily?.dayKey).not.toBe(session.daily!.dayKey);
  } finally { release(); await held; }
});

it('retains a prepared command across process replacement without retaining a rolled-back preparation token', async () => {
  const { engine, session } = await ready();
  library.database.prepare('UPDATE daily_flow_state SET invalidated=1').run();
  const prepare = engine.journal.prepare.bind(engine.journal);
  vi.spyOn(engine.journal, 'prepare').mockImplementationOnce(async (...args) => {
    await prepare(...args); throw new Error('stop_after_prepared_command');
  });
  await engine.journal.accept({ id: crypto.randomUUID(), libraryId: engine.journal.libraryId,
    nodeId: session.currentNodeId!, dayKey: session.daily!.dayKey, now, mode: 'recommended',
    historyKey: 'prepared-crash-history', predecessor: null, settings: companionDailyFlowSettings() });
  await engine.restore();
  await expect(engine.drain()).rejects.toThrow('stop_after_prepared_command');
  const before = (await engine.journal.rows())[0]!;
  expect(before.command?.token.revision).toBe((await loadCompanionDailySession())?.daily?.revision);
  expect(library.database.prepare('SELECT count(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
  await reopenSearchLibrary(library.root, now);
  const restored = await getCompanionReadIntents();
  await restored.retry();
  const after = (await restored.journal.rows(false))[0]!;
  expect(after.intent.id).toBe(before.intent.id);
  expect(after.command).toEqual(before.command);
  expect(after.state).toBe('applied');
  expect(await getIosCompanionDatabaseOwner().read(db => db.query('SELECT repetition_count FROM node_reading WHERE node_id=?', [session.currentNodeId!])))
    .toEqual([{ repetition_count: 1 }]);
});

it('retains B successor through the complete A receipt and catalog refresh without selecting it again', async () => {
  const { engine, session } = await ready();
  const owner = getIosCompanionDatabaseOwner();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const held = owner.runWriter(async () => { await waiting; });
  try {
    const b = (await engine.accept({ session, now, mode: 'recommended', historyKey: 'receipt-preparation' })).session;
    const prepared = await engine.displayPreparation.prepare({ session: b, now, mode: 'recommended' });
    expect(prepared.session.currentNodeId).toBe('000002');
    release(); await held; await engine.drain();
    const { refreshCompanionWorkspaceAfterMutation } = await import('../companionWorkspaceRepository');
    await refreshCompanionWorkspaceAfterMutation();
    const committed = (await loadCompanionDailySession())!;
    expect(committed.currentNodeId).toBe(b.currentNodeId);
    const reads = vi.spyOn(owner, 'readInteractiveSnapshot').mockRejectedValue(new Error('repeated_receipt_selection'));
    const c = await engine.accept({ session: committed, now, mode: 'recommended', historyKey: 'receipt-preparation' });
    expect(c.session.currentNodeId).toBe('000002');
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
    await engine.drain();
    expect(library.database.prepare('SELECT count FROM topic_daily_counts').get()).toEqual({ count: 2 });
  } finally { release(); await held; }
});
