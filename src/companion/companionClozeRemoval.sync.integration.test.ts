// @vitest-environment node
import { unlinkSync } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: createCompanionNativeSyncStub
  };
});

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver';
import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver';
import { score } from '../../electron/database/reviewProjection.testSupport';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { syncRequestLibrary as sync } from '../../electron/database/syncRequestLibrary.testSupport';
import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
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
async function reopenMobile(peer: Peer) {
  await closeIosCompanionDatabase();
  peer.db.close();
  peer.db = new Database(peer.file);
  peer.driver = createBetterSqlite3Driver(peer.db);
  peer.port = createBetterSqliteDbPort(peer.db);
  await openMobile(peer);
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
  const reviewPeer = { sqlite: peer.db, id: peer.name };
  score(reviewPeer, 'cloze-first', '2026-09-01T12:00:00.000Z', 3, 'cloze');
  score(reviewPeer, 'cloze-second', '2026-09-03T12:00:00.000Z', 3, 'cloze');
}
async function snapshot() {
  return (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
}
function assertFacts(peer: Peer, deleted: boolean, log: unknown[], review: unknown) {
  const read = new Database(peer.file, { readonly: true });
  try {
    expect(Boolean((read.prepare('SELECT deleted_at FROM nodes WHERE id = ?').get('cloze') as { deleted_at: string | null }).deleted_at)).toBe(deleted);
    expect(read.prepare('SELECT deleted_at FROM nodes WHERE id IN (?, ?) ORDER BY id').all('source', 'other'))
      .toEqual([{ deleted_at: null }, { deleted_at: null }]);
    expect(read.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(log);
    expect(read.prepare('SELECT * FROM node_review WHERE node_id = ?').get('cloze')).toEqual(review);
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
  const review = mobile.db.prepare('SELECT * FROM node_review WHERE node_id = ?').get('cloze');
  expect(log).toHaveLength(2);
  expect(initial.nodesById.cloze!.review?.reps).toBe(2);
  for (const peer of [desktop, mobile]) assertFacts(peer, false, log, review);
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
  assertFacts(mobile, true, log, review);
  await sync(mobile, desktop);
  await sync(desktop, mobile);
  for (const peer of [desktop, mobile]) assertFacts(peer, true, log, review);

  await reopenMobile(mobile);
  assertFacts(mobile, true, log, review);
  await restoreCompanionTrashNode({ deviceId: mobile.name, nodeId: 'cloze', snapshot: await snapshot() });
  const restored = await loadCompanionWorkspaceNode('cloze');
  expect(restored).toMatchObject({ content: before!.content, reveal: before!.reveal, anchorLink: before!.anchorLink });
  expect(restored?.deletedAt).toBeFalsy();
  const restoredSnapshot = await snapshot();
  expect(restoredSnapshot.nodesById.cloze!.review).toEqual(initial.nodesById.cloze!.review);
  assertFacts(mobile, false, log, review);
  const activeReading = reconcileFlowSession(deleted, reading, 'recommended');
  expect(reconcileFlowSession(restoredSnapshot, activeReading, 'recommended')).toMatchObject({
    currentNodeId: 'source', reviewedItemCount: reading.reviewedItemCount
  });
  await sync(mobile, desktop);
  await sync(desktop, mobile);
  for (const peer of [desktop, mobile]) assertFacts(peer, false, log, review);
  expect(await loadCompanionWorkspaceNode('source')).toEqual(source);
  expect(await loadCompanionWorkspaceNode('other')).toEqual(other);
});
