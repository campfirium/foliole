// @vitest-environment node
import { File } from 'node:buffer';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { companionEpubBook } from '../../tests/fixtures/companionEpubBook';
import * as projections from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { saveIosReading } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseWrites';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createCompanionFileImportHandler } from './companionFileImportActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => { library = await createSearchLibrary(0); });
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });
async function importBook(failRefresh = false) {
  const result = await createCompanionFileImportHandler({ refreshAfterMutation: async () => {
    if (failRefresh) throw new Error('Refresh unavailable');
    return (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  } })(new File([Uint8Array.from(companionEpubBook(false))], 'Book.epub'));
  if ('error' in result) throw new Error(result.error);
  expect(result.epubReadingMode).toBeDefined();
  return { ...result, choice: result.epubReadingMode! };
}
const states = () => library.database.prepare(`SELECT n.title,r.state FROM node_reading r
  JOIN nodes n ON n.id=r.node_id ORDER BY n.title`).all();
it('persists the sequential source preference and one released topic through library reopening', async () => {
  const result = await importBook();
  await result.choice.apply('sequential');
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toHaveProperty('sequentialReadingEnabled', true);
  expect(states()).toEqual([{ title: 'First section', state: 'locked' }, { title: 'Part One', state: 'active' }, { title: 'Second section', state: 'locked' }]);
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  expect(snapshot.nodesById[result.nodeId]!.sequentialReadingEnabled).toBe(true);
  const { db } = await reopenSearchLibrary(library.root, '2026-11-03T10:00:00Z');
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toHaveProperty('sequentialReadingEnabled', true);
  expect(db.prepare("SELECT count(*) AS count FROM node_reading WHERE state='active'").get()).toEqual({ count: 1 });
  expect(db.prepare("SELECT count(*) AS count FROM node_reading WHERE state='locked'").get()).toEqual({ count: 2 });
});
it('makes all topics available in free mode while preserving prior progress and intervals', async () => {
  const result = await importBook();
  const topic = library.database.prepare("SELECT id FROM nodes WHERE title='First section'").get() as { id: string };
  await saveIosReading({ node_id: topic.id, reading_json: JSON.stringify({ state: 'active', interval_duration_ms: 321000,
    interval_growth_factor: 2, reading_position: 42, repetition_count: 4, next_at: '2026-11-04T00:00:00Z' }) });
  await result.choice.apply('sequential');
  await result.choice.apply('free');
  expect(states().every(row => (row as { state: string }).state === 'active')).toBe(true);
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toHaveProperty('sequentialReadingEnabled', false);
  expect(library.database.prepare('SELECT interval_duration_ms,repetition_count,next_at FROM node_reading WHERE node_id=?').get(topic.id))
    .toEqual({ interval_duration_ms: 321000, repetition_count: 4, next_at: '2026-11-04T00:00:00Z' });
});
it('rolls back a failed preference save and retries without importing another book', async () => {
  const result = await importBook();
  library.database.exec("CREATE TRIGGER reject_mode BEFORE INSERT ON node_reading WHEN NEW.node_id=(SELECT id FROM nodes WHERE title='Second section') BEGIN SELECT RAISE(ABORT,'Unavailable'); END");
  await expect(result.choice.apply('sequential')).rejects.toThrow();
  expect(states()).toEqual([]);
  expect((await loadCompanionWorkspaceNode(result.nodeId))!.sequentialReadingEnabled).not.toBe(true);
  library.database.exec('DROP TRIGGER reject_mode');
  await result.choice.apply('sequential');
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 1 });
});
it('does not create another metadata version when a saved choice is retried', async () => {
  const result = await importBook(); await result.choice.apply('sequential');
  const before = library.database.prepare('SELECT count(*) AS count FROM node_sync_versions').get();
  await result.choice.apply('sequential');
  expect(library.database.prepare('SELECT count(*) AS count FROM node_sync_versions').get()).toEqual(before);
});
it('retains the post-import choice through a list-refresh failure', async () => {
  const result = await importBook(true);
  expect(result).toHaveProperty('retryRefresh');
  await result.choice.apply('free');
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toHaveProperty('sequentialReadingEnabled', false);
});
it('does not apply a stale choice to a reopened library generation', async () => {
  const result = await importBook();
  const { db } = await reopenSearchLibrary(library.root, '2026-11-03T11:00:00Z');
  await expect(result.choice.apply('sequential')).rejects.toThrow('Import library changed');
  expect(db.prepare('SELECT * FROM node_reading').all()).toEqual([]);
});

it('reports a committed preference as saved even when its projection refresh fails', async () => {
  const result = await importBook();
  vi.spyOn(projections, 'updateCommittedCompanionWorkspace').mockRejectedValueOnce(new Error('Projection unavailable'));
  await expect(result.choice.apply('sequential')).resolves.toBe(result.nodeId);
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toHaveProperty('sequentialReadingEnabled', true);
});

it('keeps source settings outside node-edit undo history, as desktop does', async () => {
  const result = await importBook();
  const history = () => library.database.prepare("SELECT key,value FROM companion_meta WHERE key LIKE 'flow_history:%'").all();
  const before = history();
  await result.choice.apply('sequential');
  expect(history()).toEqual(before);
});

it.each(['sequential', 'free'] as const)('continues through the imported chapter tree in %s mode', async readingMode => {
  const result = await importBook();
  await result.choice.apply(readingMode);
  const { findNextSequentialReadingTopic } = await import('../../lib/core/review/sequentialReadingNextTopic');
  const { openCompanionDailyFlow } = await import('../shared/platform/companion/runtime/companionDailyFlow');
  const { getCompanionReadIntents } = await import('../shared/platform/companion/runtime/companionReadIntents');
  const now = new Date().toISOString();
  const mode = 'reading-only' as const;
  const historyKey = 'flow_history:epub-continue';
  const readSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  const initial = await readSnapshot();
  const part = findNextSequentialReadingTopic({ ...initial, currentNodeId: result.nodeId })!;
  expect(initial.nodesById[part]!.title).toBe('Part One');
  let { session } = await openCompanionDailyFlow({ now, mode, preferredNodeId: part });
  expect(session.currentNodeId).toBe(part);
  const engine = await getCompanionReadIntents();
  for (const title of ['First section', 'Second section']) {
    const before = await readSnapshot();
    const nextTopicId = findNextSequentialReadingTopic({ ...before, currentNodeId: session.currentNodeId! })!;
    expect(before.nodesById[nextTopicId]!.title).toBe(title);
    expect(before.nodesById[nextTopicId]!.reading?.state).toBe(readingMode === 'sequential' ? 'locked' : 'active');
    ({ session } = await engine.accept({ session, now, mode, historyKey, snapshot: before, nextTopicId }));
    expect(session.currentNodeId).toBe(nextTopicId);
  }
  const saved = await readSnapshot();
  expect(saved.nodesById[session.currentNodeId!]!.reading?.state).toBe('active');
  expect(findNextSequentialReadingTopic({ ...saved, currentNodeId: session.currentNodeId! })).toBeNull();
});
