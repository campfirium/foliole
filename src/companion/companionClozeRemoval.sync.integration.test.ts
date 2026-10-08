// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({
  configureFramedSyncPayloadBudget: async () => {}, closeFramedSyncPayloadBudget: async () => {}
}) }));

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver';
import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver';
import { closeLibraries, createPeer, joinPeers, startLibraries, sync, type Peer } from '../../electron/database/syncEmptyLibraryTestSupport';
import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import { applyReviewGrade } from '../../lib/core/database/reviewMutations';
import { readCompanionHighlight } from '../shared/platform/companion/reading/companionHighlightRead';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase, type IosCompanionDatabaseManager } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { reconcileFlowSession, resumeFlowSession } from '../store/workspaceFlowSession';

import { deleteCompanionExistingHighlight } from './companionExistingHighlightPersistence';
import { restoreCompanionTrashNode } from './companionTrashActions';

const now = new Date(2026, 9, 3, 12).toISOString();
beforeEach(startLibraries);
afterEach(async () => { await closeIosCompanionDatabase(); await closeLibraries(); });

async function openMobile(peer: Peer) {
  const connection = { ...createFakeCapacitorConnection(peer.db), getUrl: async () => ({ url: peer.file }) };
  const manager = { closeConnection: async () => {}, createConnection: async () => connection,
    isConnection: async () => ({ result: false }), isDatabase: async () => ({ result: true }),
    retrieveConnection: async () => connection } as unknown as IosCompanionDatabaseManager;
  await initializeIosCompanionDatabase({ booted_at: now, database_path: null, database_ready: false,
    host_name: peer.name, runtime_kind: 'android-capacitor' }, manager);
}
function seed(peer: Peer) {
  for (const id of ['source', 'cloze', 'other']) {
    upsertNodeSnapshot(peer.driver, { nodeId: id, parentNodeId: id === 'source' ? null : 'source',
      kind: id === 'cloze' ? 'item' : 'topic', title: id, isTitleManual: false, content: id === 'cloze' ? 'Alpha [...] Gamma' : 'Alpha Beta Gamma',
      reveal: id === 'cloze' ? 'Beta' : null, createdAt: now, updatedAt: now, position: null, hostName: peer.name,
      anchorLink: id === 'source' ? null : { id, kind: id === 'cloze' ? 'cloze' : 'highlight',
        locator: id === 'cloze' ? { ranges: [{ from: 0, to: 5, originalText: 'Alpha' },
          { from: 6, to: 10, originalText: 'Beta' }] } : { from: 6, to: 10, originalText: 'Beta' } } });
    flushNodeSyncVersionWithDriver(peer.driver, id, peer.name, now);
  }
  const card = { due: now, last_review: now, state: 2 as const, stability: 4, difficulty: 3,
    elapsed_days: 1, scheduled_days: 1, reps: 2, lapses: 0 };
  applyReviewGrade(peer.driver, { nodeId: 'cloze', grade: 3, reviewedAt: now, schedulerVersion: 'fixture',
    cardBefore: { ...card, reps: 1 }, cardAfter: card }, { hostName: peer.name, createId: randomUUID });
}
async function snapshot() {
  return (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
}
function assertFacts(peer: Peer, deleted: boolean, log: unknown[]) {
  const read = new Database(peer.file, { readonly: true });
  try {
    expect(Boolean((read.prepare('SELECT deleted_at FROM nodes WHERE id = ?').get('cloze') as { deleted_at: string | null }).deleted_at)).toBe(deleted);
    expect(read.prepare('SELECT deleted_at FROM nodes WHERE id IN (?, ?) ORDER BY id').all('source', 'other'))
      .toEqual([{ deleted_at: null }, { deleted_at: null }]);
    expect(read.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(log);
    expect(read.prepare('SELECT * FROM node_review WHERE node_id = ?').get('cloze')).toBeUndefined();
  } finally { read.close(); }
}

it('soft deletes, synchronizes and restores the same cloze after reopening without inventing review state', async () => {
  const desktop = createPeer('desktop');
  const mobile = createPeer('mobile');
  mobile.db.close();
  unlinkSync(mobile.file);
  mobile.db = new Database(mobile.file);
  mobile.driver = createBetterSqlite3Driver(mobile.db);
  mobile.port = createBetterSqliteDbPort(mobile.db);
  await bootstrapCompanionDatabase(mobile.port, { allowCreate: true, expectedHostName: mobile.name, now });
  joinPeers(desktop, mobile);
  seed(desktop);
  await sync(desktop, mobile);
  await openMobile(mobile);
  const initial = await snapshot();
  const before = await loadCompanionWorkspaceNode('cloze');
  const source = await loadCompanionWorkspaceNode('source');
  const other = await loadCompanionWorkspaceNode('other');
  const log = mobile.db.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  expect(log).toHaveLength(1);
  expect(initial.nodesById.cloze!.review?.reps).toBe(2);
  const session = resumeFlowSession(initial, 'review-first', 'cloze', now);
  expect(session.currentNodeId).toBe('cloze');
  session.isAnswerRevealed = true;
  const { guard } = await readCompanionHighlight(initial, 'cloze', 'cloze');
  await deleteCompanionExistingHighlight({ deviceId: mobile.name, nodeId: 'cloze', snapshot: initial, guard });
  const deleted = await snapshot();
  expect(reconcileFlowSession(deleted, session, 'review-first')).toMatchObject({ currentNodeId: null, isAnswerRevealed: false,
    reviewedItemCount: session.reviewedItemCount });
  const reading = { ...session, currentNodeId: 'source', queueNodeIds: ['source', 'cloze'] };
  expect(reconcileFlowSession(deleted, reading, 'recommended')).toMatchObject({ currentNodeId: 'source', queueNodeIds: ['source'],
    reviewedItemCount: reading.reviewedItemCount });
  expect(await loadCompanionWorkspaceNode('source')).toEqual(source);
  expect(await loadCompanionWorkspaceNode('other')).toEqual(other);
  await sync(mobile, desktop);
  await sync(desktop, mobile);
  for (const peer of [desktop, mobile]) assertFacts(peer, true, log);

  await closeIosCompanionDatabase();
  mobile.db.close();
  mobile.db = new Database(mobile.file);
  mobile.driver = createBetterSqlite3Driver(mobile.db);
  mobile.port = createBetterSqliteDbPort(mobile.db);
  await openMobile(mobile);
  await restoreCompanionTrashNode({ deviceId: mobile.name, nodeId: 'cloze', snapshot: await snapshot() });
  const restored = await loadCompanionWorkspaceNode('cloze');
  expect(restored).toMatchObject({ content: before!.content, reveal: before!.reveal, anchorLink: before!.anchorLink });
  expect(restored?.deletedAt).toBeFalsy();
  expect((await snapshot()).nodesById.cloze!.review).toBeNull();
  await sync(mobile, desktop);
  await sync(desktop, mobile);
  for (const peer of [desktop, mobile]) assertFacts(peer, false, log);
  expect(await loadCompanionWorkspaceNode('source')).toEqual(source);
  expect(await loadCompanionWorkspaceNode('other')).toEqual(other);
});
