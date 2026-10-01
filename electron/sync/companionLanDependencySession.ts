import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CHAIN_HEAD_SQL } from '../../lib/core/sync/nodeVersionChainSql.js';
import { SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES, type SyncPackDependencyTransfer,
  type SyncPackNodeDependencyObjectType } from '../../lib/core/sync/syncPackDependencyTransfer.js';
import type { SyncPackFactClaims, SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { openDatabaseConnection } from '../database/connection.js';
import { describeSyncPackDependencySource } from '../database/syncPackDependencySource.js';
import { loadDesktopSyncPackFactIndex } from '../database/syncPackFactIndex.js';
import { loadPresentSyncPackStateRows } from '../database/syncPackRows.js';
import { createSyncPackSourceView, openSyncPackSourceView } from '../database/syncPackSourceView.js';
import { resolveAppPaths } from '../ipc/paths.js';

export interface CompanionDependencySession {
  index: SyncPackFactIndex;
  claims: SyncPackFactClaims;
  transfer: SyncPackDependencyTransfer;
  transfers?: SyncPackDependencyTransfer[];
  toPeerId: string;
  claimDatabase?: true;
}

export function sessionRoot(groupId: string, peerId: string) {
  const scope = createHash('sha256').update(JSON.stringify([
    openDatabaseConnection().dbPath, groupId, peerId
  ])).digest('hex');
  return path.join(resolveAppPaths().app_cache_dir, 'sync-pack-source-views', scope);
}

export async function releaseConfirmedCompanionDependencySession(groupId: string, peerId: string, packId: string) {
  if (!/^[a-f0-9-]{36}$/u.test(packId)) return;
  const root = path.join(sessionRoot(groupId, peerId), packId);
  try { await fs.access(path.join(root, 'session.json')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const session = await openCompanionDependencySession(groupId, peerId, packId);
  try {
    const driver = openDatabaseConnection().driver;
    if (driver.queryOne('SELECT 1 FROM node_version_outbound_holds WHERE pack_id = ? LIMIT 1', [packId])) return;
    const objectIds = [...new Set([...(session.transfers ?? [session.transfer]).flatMap(
      (transfer) => transfer.nodeIds ?? [transfer.objectId]),
      ...session.index.versions.map((version) => version.object_id)])];
    if (objectIds.length === 0) return;
    for (const objectId of objectIds) {
      const head = session.view.driver.queryOne<{ current_version_id: string }>(
        CHAIN_HEAD_SQL, [objectId]);
      if (!head?.current_version_id) continue;
      const confirmed = driver.queryOne(`SELECT 1 FROM node_version_pack_receipts
        WHERE pack_id = ? AND object_id = ? AND group_id = ? AND device_identity_key = ?
          AND sent_version_id = ? AND result = 'applied'`,
      [packId, objectId, groupId, peerId, head.current_version_id]);
      if (!confirmed) return;
    }
  } finally { session.view.close(); }
  await fs.rm(root, { recursive: true, force: true });
}

export async function openCompanionDependencySession(groupId: string, peerId: string, viewId: string) {
  if (!/^[a-f0-9-]{36}$/u.test(viewId)) throw new Error('sync_pack_source_view_invalid');
  const root = path.join(sessionRoot(groupId, peerId), viewId);
  let session: CompanionDependencySession;
  try { session = JSON.parse(await fs.readFile(path.join(root, 'session.json'), 'utf8')) as CompanionDependencySession; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('sync_pack_source_view_unavailable');
    throw error;
  }
  if (session.toPeerId !== peerId || session.transfer.groupId !== groupId ||
      session.transfer.sourceViewId !== viewId ||
      (session.transfers && (session.transfers.length < 1 || session.transfers.length > 128 ||
        session.transfers[0]?.objectId !== session.transfer.objectId ||
        session.transfers.some((transfer) => transfer.groupId !== groupId ||
          transfer.sourceViewId !== viewId || transfer.peerId !== session.transfer.peerId ||
          transfer.sourceEpoch !== session.transfer.sourceEpoch ||
          transfer.fromStateSeq !== session.transfer.fromStateSeq ||
          transfer.frontierStateSeq !== session.transfer.frontierStateSeq)))) {
    throw new Error('sync_pack_source_view_changed');
  }
  const sourcePath = path.join(root, 'source.db');
  try { await fs.access(sourcePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('sync_pack_source_view_unavailable');
    throw error;
  }
  const view = openSyncPackSourceView(sourcePath);
  let expectedViewId = viewId;
  if (session.claimDatabase) {
    try {
      const facts = JSON.parse(await fs.readFile(path.join(root, 'fact-session.json'), 'utf8')) as {
        roundSourceViewId: string;
      };
      if (!facts.roundSourceViewId) throw new Error('sync_pack_source_view_unavailable');
      expectedViewId = facts.roundSourceViewId;
    } catch (error) {
      view.close();
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('sync_pack_source_view_unavailable');
      }
      throw error;
    }
  }
  if (view.sourceViewId !== expectedViewId || view.sourceEpoch !== session.transfer.sourceEpoch) {
    view.close();
    throw new Error('sync_pack_source_view_changed');
  }
  if (session.claimDatabase) {
    const claimsPath = path.join(root, 'fact-claims.db');
    try { await fs.access(claimsPath); }
    catch (error) {
      view.close();
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('sync_pack_source_view_unavailable');
      throw error;
    }
    view.driver.execute('ATTACH DATABASE ? AS fact_claims', [claimsPath]);
  }
  return { ...session, view: session.claimDatabase ? { ...view, sourceViewId: viewId } : view };
}

export async function createCompanionDependencySession(args: {
  groupId: string; fromPeerId: string; toPeerId: string;
  index: SyncPackFactIndex; claims: SyncPackFactClaims;
}) {
  const base = sessionRoot(args.groupId, args.toPeerId);
  await fs.mkdir(base, { recursive: true });
  const staging = await fs.mkdtemp(path.join(base, '.preparing-'));
  const view = await createSyncPackSourceView(openDatabaseConnection().sqlite, path.join(staging, 'source.db'));
  try {
    const index = loadDesktopSyncPackFactIndex(view.driver, { fromStateSeq: args.index.from_state_seq,
      frontierStateSeq: args.index.frontier_state_seq, sourceEpoch: args.index.source_epoch });
    if (index.index_id !== args.index.index_id) throw new Error('sync_pack_fact_index_changed');
    const selected = loadPresentSyncPackStateRows(view.driver, index.from_state_seq, index.to_state_seq)
      .find((row) => SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES.some((type) => type === row.object_type));
    const object = selected ? { ...selected, object_type: selected.object_type as SyncPackNodeDependencyObjectType } : null;
    if (!object) throw new Error('sync_pack_dependency_object_unavailable');
    const description = describeSyncPackDependencySource({ view, objectId: object.object_id,
      objectType: object.object_type, claims: args.claims, budget: { rows: 128, payloadBytes: 2 * 1024 * 1024 } });
    if (description.expectedRows === 0) throw new Error('sync_pack_dependency_object_unavailable');
    const session: CompanionDependencySession = { index, claims: args.claims, toPeerId: args.toPeerId,
      transfer: { ...description, groupId: args.groupId, peerId: args.fromPeerId,
        sourceViewId: view.sourceViewId, sourceEpoch: index.source_epoch,
        objectType: object.object_type, objectId: object.object_id, fromStateSeq: index.from_state_seq,
        objectStateSeq: object.state_seq, frontierStateSeq: index.frontier_state_seq } };
    await fs.writeFile(path.join(staging, 'session.json'), JSON.stringify(session), { mode: 0o600 });
    holdSourceFacts(session, view);
    view.close();
    await fs.rename(staging, path.join(base, session.transfer.sourceViewId));
    return openCompanionDependencySession(args.groupId, args.toPeerId, session.transfer.sourceViewId);
  } finally {
    try { view.close(); } catch { /* Already closed before publication. */ }
    await fs.rm(staging, { recursive: true, force: true });
  }
}

function holdSourceFacts(session: CompanionDependencySession, view: ReturnType<typeof openSyncPackSourceView>) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const objectIds = [...new Set(session.index.versions.map((version) => version.object_id))];
    for (const objectId of objectIds) {
      const head = view.driver.queryOne<{ current_version_id: string }>(
        CHAIN_HEAD_SQL, [objectId]);
      if (!head?.current_version_id) continue;
      tx.execute(`INSERT INTO node_version_outbound_holds
        (pack_id, group_id, device_identity_key, object_id, version_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`, [view.sourceViewId, session.transfer.groupId,
        session.toPeerId, objectId, head.current_version_id, new Date().toISOString()]);
    }
    for (const fact of session.index.versions) {
      if (fact.body_hash === null) continue;
      tx.execute(`INSERT INTO node_version_outbound_payload_holds (pack_id, object_id, version_id)
        VALUES (?, ?, ?)`, [view.sourceViewId, fact.object_id, fact.version_id]);
    }
  });
}
