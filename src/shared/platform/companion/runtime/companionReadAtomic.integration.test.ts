// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { companionDailyFlowSettings, openCompanionDailyFlow } from './companionDailyFlow';
import { prepareAdmittedRead } from './companionReadAdmissionCommand';
import { getCompanionReadIntents } from './companionReadIntents';
import { createSearchLibrary, reopenSearchLibrary } from './companionSearchSnapshot.testSupport';
import { saveIosReading } from './iosCompanionActiveDatabaseWrites';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
afterEach(async () => { vi.restoreAllMocks(); await library?.close(); });

it('saves a newly admitted Read in one main transaction without preparing the journal again', async () => {
  library = await createSearchLibrary(3, 16);
  const now = new Date().toISOString();
  const session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  const engine = await getCompanionReadIntents();
  await engine.displayPreparation.prepare({ session, now, mode: 'recommended' });
  const begin = vi.spyOn(library.connection, 'beginTransaction');
  const prepare = vi.spyOn(engine.journal, 'prepare');
  const query = vi.spyOn(library.connection, 'query');
  const batch = vi.spyOn(library.connection, 'executeSet');
  const accepted = await engine.accept({ session, now, mode: 'recommended', historyKey: 'atomic-history' });
  await engine.drain();
  expect(begin).toHaveBeenCalledTimes(1);
  expect(prepare).not.toHaveBeenCalled();
  expect(query.mock.calls.filter(([sql]) => sql === 'SELECT * FROM daily_flow_state WHERE id = 1')).toHaveLength(1);
  expect(query.mock.calls.filter(([sql]) => sql.includes("key = 'host_name'"))).toHaveLength(1);
  expect(query.mock.calls.filter(([sql]) => sql.includes('order_key > ?'))).toHaveLength(0);
  expect(batch.mock.calls.some(([set]) => set.some(value => value.statement.includes('INSERT INTO node_reading')))).toBe(true);
  expect(library.database.prepare('SELECT repetition_count FROM node_reading WHERE node_id=?').get(session.currentNodeId))
    .toEqual({ repetition_count: 1 });
  expect(library.database.prepare('SELECT count FROM topic_daily_counts').get()).toEqual({ count: 1 });
  const history = JSON.parse((library.database.prepare('SELECT value FROM companion_meta WHERE key=?').get('atomic-history') as {value: string}).value);
  expect(history.undoStack.map((entry: {id: string}) => entry.id)).toEqual([accepted.id]);
  expect(history.undoStack[0].afterContext.reviewSession.currentNodeId).toBe(accepted.session.currentNodeId);
});

it('rolls learning, queue, counts, operation and sync facts back if history cannot be appended', async () => {
  library = await createSearchLibrary(3, 16);
  const now = new Date().toISOString();
  const session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  const engine = await getCompanionReadIntents();
  const state = library.database.prepare('SELECT * FROM daily_flow_state').get();
  const rows = library.database.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all();
  library.database.prepare('INSERT INTO companion_meta(key,value,updated_at) VALUES(?,?,?)').run('broken-history', '{"undoStack":{},"redoStack":[]}', now);
  const accepted = await engine.accept({ session, now, mode: 'recommended', historyKey: 'broken-history' });
  await expect(engine.drain()).rejects.toThrow('flow_history_unavailable');
  expect(library.database.prepare('SELECT * FROM daily_flow_state').get()).toEqual(state);
  expect(library.database.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all()).toEqual(rows);
  for (const table of ['node_reading', 'topic_daily_counts', 'daily_flow_operations']) {
    expect(library.database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
  }
  expect(library.database.prepare("SELECT COUNT(*) AS n FROM daily_flow_sync_facts WHERE kind!='create'").get()).toEqual({ n: 0 });
  expect((await engine.journal.rows())[0]?.intent.id).toBe(accepted.id);
  library.database.prepare('UPDATE companion_meta SET value=? WHERE key=?').run('{"undoStack":[],"redoStack":[]}', 'broken-history');
  await engine.retry();
  expect(library.database.prepare('SELECT op_id FROM daily_flow_operations').get()).toEqual({ op_id: accepted.id });
  expect(library.database.prepare('SELECT count FROM topic_daily_counts').get()).toEqual({ count: 1 });
});

it('recovers the admitted result without recomputing it after inherited priority changes', async () => {
  library = await createSearchLibrary(3, 16);
  library.database.prepare("UPDATE nodes SET kind='folder',priority=2 WHERE id='000001'").run();
  library.database.prepare("UPDATE nodes SET parent_id='000001' WHERE id='000000'").run();
  const now = new Date().toISOString();
  const session = (await openCompanionDailyFlow({ now, mode: 'recommended', preferredNodeId: '000000' })).session;
  const engine = await getCompanionReadIntents();
  const intent = { id: crypto.randomUUID(), libraryId: engine.journal.libraryId, nodeId: session.currentNodeId!,
    now, dayKey: session.daily!.dayKey, mode: 'recommended' as const, historyKey: 'frozen-history',
    predecessor: null, admittedCommand: true, settings: companionDailyFlowSettings() };
  const prepared = await prepareAdmittedRead(getIosCompanionDatabaseOwner(), intent, session);
  expect(prepared.command.readings?.[0]?.after?.priority).toBe(2);
  await engine.journal.accept(intent, prepared);
  library.database.prepare("UPDATE nodes SET priority=9 WHERE id='000001'").run();
  await reopenSearchLibrary(library.root, now);
  const restored = await getCompanionReadIntents();
  await restored.drain();
  const row = (await restored.journal.rows(false))[0]!;
  expect(row.command).toEqual(prepared.command);
  expect(row.state).toBe('applied');
  expect(await getIosCompanionDatabaseOwner().read(db => db.query('SELECT priority,repetition_count FROM node_reading WHERE node_id=?', [intent.nodeId])))
    .toEqual([{ priority: 2, repetition_count: 1 }]);
});

it('keeps a newer reading position while committing the frozen learning result', async () => {
  library = await createSearchLibrary(3, 16);
  const now = new Date().toISOString();
  const profile = { interval_duration_ms: 60000, interval_growth_factor: 1.3,
    last_handled_at: '2026-01-01T00:00:00.000Z', next_at: '2026-01-02T00:00:00.000Z',
    priority: 5, reading_position: 11, repetition_count: 1, state: 'active' };
  await saveIosReading({ node_id: '000000', reading_json: JSON.stringify(profile) });
  const session = (await openCompanionDailyFlow({ now, mode: 'recommended', preferredNodeId: '000000' })).session;
  const engine = await getCompanionReadIntents();
  await engine.displayPreparation.prepare({ session, now, mode: 'recommended' });
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const held = getIosCompanionDatabaseOwner().runWriter(async () => { await waiting; });
  const position = saveIosReading({ node_id: '000000', reading_json: JSON.stringify({ ...profile, reading_position: 77 }) });
  try {
    await engine.accept({ session, now, mode: 'recommended', historyKey: 'position-history' });
    release(); await held; await position; await engine.drain();
    expect(library.database.prepare('SELECT reading_position FROM node_reading_host_state WHERE node_id=?').get('000000'))
      .toEqual({ reading_position: 77 });
    expect(library.database.prepare('SELECT repetition_count FROM node_reading WHERE node_id=?').get('000000'))
      .toEqual({ repetition_count: 2 });
  } finally { release(); await held; await position; }
});
