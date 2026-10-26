// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { restoreFlowHistoryEntry } from '../../lib/core/flow/flowHistoryEntry';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { appendCompanionFlowHistory, writeCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const key = 'flow_history:bounded-append';
beforeEach(async () => { library = await createSearchLibrary(0); });
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

function entry(id: string) {
  const session = { ...createEmptyReviewSession(), currentNodeId: 'a', totalNodeCount: 1000,
    queueNodeIds: Array.from({ length: 1000 }, (_, i) => `history-node-${i}`) };
  const context = { activeNodeId: 'a', browseRootNodeId: '', reviewSession: session };
  return { type: 'topic.dismiss' as const, title: 'Soon Topic' as const, id, nodeId: 'a',
    mutationTimestamp: '2026-10-26T00:00:00.000Z', beforeReading: null, afterReading: null,
    beforeContext: context, afterContext: context };
}

async function loadRestoredHistory() {
  const saved = await loadCompanionFlowHistory(key);
  const session = entry('reference').beforeContext.reviewSession;
  return { ...saved, undoStack: saved.undoStack.map(value => restoreFlowHistoryEntry(value, session)),
    redoStack: saved.redoStack.map(value => restoreFlowHistoryEntry(value, session)) };
}

function observeWriterBytes() {
  let bytes = 0;
  const owner = getIosCompanionDatabaseOwner();
  const original = owner.runWriter.bind(owner);
  const observe = (db: DbPort): DbPort => ({
    query: async <R extends DbRow>(sql: string, params?: DbParams) => {
      const rows = await db.query<R>(sql, params);
      bytes += JSON.stringify(rows).length;
      return rows;
    }, run: async (sql, params) => {
      bytes += JSON.stringify(params ?? []).length;
      return db.run(sql, params);
    }, transaction: task => db.transaction(tx => task(observe(tx)))
  });
  vi.spyOn(owner, 'runWriter').mockImplementation(<T>(task: (db: DbPort) => Promise<T>) => original(db => task(observe(db))));
  return () => bytes;
}

it('appends only the new entry across the bridge and retains the newest fifty undo steps', async () => {
  const undoStack = Array.from({ length: 50 }, (_, i) => entry(`old-${i}`));
  await writeIosCompanionDatabase(db => writeCompanionFlowHistory(db, key, { undoStack, redoStack: [entry('redo')] }));
  const bytes = observeWriterBytes();
  const next = entry('new');
  await writeIosCompanionDatabase(db => db.transaction(tx => appendCompanionFlowHistory(tx, key, next)));
  expect(bytes()).toBeLessThan(JSON.stringify(next).length * 3);
  const saved = await loadRestoredHistory();
  expect(saved.undoStack).toEqual([...undoStack.slice(1), next]);
  expect(saved.redoStack).toEqual([]);
});

it('creates an empty history atomically and leaves its prior contents on a rejected append', async () => {
  const next = entry('first');
  await writeIosCompanionDatabase(db => db.transaction(tx => appendCompanionFlowHistory(tx, key, next)));
  library.database.exec(`CREATE TRIGGER reject_append BEFORE INSERT ON companion_meta
    WHEN NEW.key = '${key}' BEGIN SELECT RAISE(ABORT, 'append failed'); END;`);
  await expect(writeIosCompanionDatabase(db => db.transaction(tx => appendCompanionFlowHistory(tx, key, entry('failed')))))
    .rejects.toThrow('append failed');
  expect((await loadRestoredHistory()).undoStack).toEqual([next]);
});

it('refuses to replace a stored history with an invalid stack shape', async () => {
  const invalid = JSON.stringify({ undoStack: 'not an array', redoStack: [] });
  library.database.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)')
    .run(key, invalid, '2026-10-26');
  await expect(writeIosCompanionDatabase(db => db.transaction(tx => appendCompanionFlowHistory(tx, key, entry('new')))))
    .rejects.toThrow();
  expect(library.database.prepare('SELECT value FROM companion_meta WHERE key = ?').get(key)).toEqual({ value: invalid });
});

it('does not inspect the complete history once per retained undo step', async () => {
  const undoStack = Array.from({ length: 50 }, (_, i) => entry(`old-${i}`));
  await writeIosCompanionDatabase(db => writeCompanionFlowHistory(db, key, { undoStack, redoStack: [] }));
  const storedBytes = JSON.stringify({ undoStack, redoStack: [] }).length;
  const native = new Database(':memory:');
  const length = native.prepare('SELECT json_array_length(?, ?) AS size');
  let inspectedBytes = 0;
  library.database.function('json_array_length', { deterministic: true }, (value: string, path: string) => {
    inspectedBytes += value.length;
    return (length.get(value, path) as { size: number }).size;
  });
  try {
    await writeIosCompanionDatabase(db => db.transaction(tx => appendCompanionFlowHistory(tx, key, entry('new'))));
    expect(inspectedBytes).toBeLessThanOrEqual(storedBytes * 2);
    expect((await loadRestoredHistory()).undoStack).toEqual([...undoStack.slice(1), entry('new')]);
  } finally { native.close(); }
});

it('trims an oversized stored stack to the same newest fifty steps', async () => {
  const undoStack = Array.from({ length: 53 }, (_, i) => entry(`old-${i}`));
  await writeIosCompanionDatabase(db => writeCompanionFlowHistory(db, key, { undoStack, redoStack: [entry('redo')] }));
  await writeIosCompanionDatabase(db => db.transaction(tx => appendCompanionFlowHistory(tx, key, entry('new'))));
  const saved = await loadRestoredHistory();
  expect(saved.undoStack).toEqual([...undoStack.slice(4), entry('new')]);
  expect(saved.redoStack).toEqual([]);
});
