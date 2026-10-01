import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { openDatabaseConnection } from '../database/connection.js';
import { createSyncPackSourceView, openSyncPackSourceView } from '../database/syncPackSourceView.js';

import { sessionRoot } from './companionLanDependencySession.js';

interface SourceRound {
  groupId: string;
  peerId: string;
  frontierStateSeq: number;
  sourceEpoch: string;
}

const roundRoot = (scope: Pick<SourceRound, 'groupId' | 'peerId'>) =>
  path.join(sessionRoot(scope.groupId, scope.peerId), '.round-source');

export function openCompanionSourceRoundView(scope: SourceRound) {
  const sourcePath = path.join(roundRoot(scope), 'source.db');
  if (!existsSync(sourcePath)) return null;
  const view = openSyncPackSourceView(sourcePath);
  if (view.sourceEpoch === scope.sourceEpoch &&
      view.frontierStateSeq === scope.frontierStateSeq) return view;
  view.close();
  return null;
}

export async function getOrCreateCompanionSourceRoundView(scope: SourceRound, freshRound = false) {
  const existing = freshRound ? null : openCompanionSourceRoundView(scope);
  if (existing) return existing;
  const parent = sessionRoot(scope.groupId, scope.peerId);
  await fs.mkdir(parent, { recursive: true });
  const staged = await fs.mkdtemp(path.join(parent, '.round-preparing-'));
  try {
    const view = await createSyncPackSourceView(openDatabaseConnection().sqlite,
      path.join(staged, 'source.db'));
    try {
      if (view.sourceEpoch !== scope.sourceEpoch ||
          view.frontierStateSeq !== scope.frontierStateSeq) {
        throw new Error('sync_pack_source_view_unavailable');
      }
      retainRoundVersions(view, scope);
    } finally { view.close(); }
    await fs.rm(roundRoot(scope), { recursive: true, force: true });
    await fs.rename(staged, roundRoot(scope));
    return openSyncPackSourceView(path.join(roundRoot(scope), 'source.db'));
  } finally { await fs.rm(staged, { recursive: true, force: true }); }
}

export async function markCompanionSourceRoundFinalPack(scope: SourceRound,
  packId: string, toStateSeq: number) {
  if (toStateSeq !== scope.frontierStateSeq || !/^[a-f0-9-]{36}$/u.test(packId)) return;
  const view = openCompanionSourceRoundView(scope);
  if (!view) return;
  view.close();
  const markers = path.join(roundRoot(scope), 'final-packs');
  await fs.mkdir(markers, { recursive: true });
  await fs.writeFile(path.join(markers, packId), '', { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
}

export async function releaseCompanionSourceRoundOnReceipt(groupId: string, peerId: string,
  packId: string) {
  if (!/^[a-f0-9-]{36}$/u.test(packId)) return;
  const scope = { groupId, peerId };
  try { await fs.access(path.join(roundRoot(scope), 'final-packs', packId)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const view = openSyncPackSourceView(path.join(roundRoot(scope), 'source.db'));
  const roundId = view.sourceViewId;
  view.close();
  openDatabaseConnection().driver.transaction((tx) => {
    const nodes = tx.queryAll<{ object_id: string }>(
      'SELECT object_id FROM node_version_outbound_holds WHERE pack_id = ?', [roundId]);
    tx.execute('DELETE FROM node_version_outbound_holds WHERE pack_id = ?', [roundId]);
    tx.execute('DELETE FROM node_version_outbound_payload_holds WHERE pack_id = ?', [roundId]);
    for (const node of nodes) collectNodeVersionChainWithDriver(tx, node.object_id);
  });
  await fs.rm(roundRoot(scope), { recursive: true, force: true });
}

function retainRoundVersions(view: ReturnType<typeof openSyncPackSourceView>, scope: SourceRound) {
  const heads = view.driver.queryAll<{ id: string; current_version_id: string }>(
    `SELECT id, current_version_id FROM nodes WHERE current_version_id IS NOT NULL
      AND id NOT IN ('special-inbox', 'special-virtual-root')
      UNION SELECT t.node_id AS id, t.version_id AS current_version_id FROM node_sync_tombstones t
      JOIN node_sync_versions v ON v.object_id = t.node_id AND v.version_id = t.version_id`);
  openDatabaseConnection().driver.transaction((tx) => {
    for (const head of heads) {
      tx.execute(`INSERT OR IGNORE INTO node_version_outbound_holds
        (pack_id, group_id, device_identity_key, object_id, version_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [view.sourceViewId, scope.groupId, scope.peerId, head.id, head.current_version_id, new Date().toISOString()]);
      for (const row of view.driver.queryAll<{ version_id: string }>(
        'SELECT version_id FROM node_sync_versions WHERE object_id = ?', [head.id])) {
        tx.execute('INSERT OR IGNORE INTO node_version_outbound_payload_holds VALUES (?, ?, ?)',
          [view.sourceViewId, head.id, row.version_id]);
      }
    }
  });
}
