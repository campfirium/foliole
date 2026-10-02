import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { resolveAttachmentFileForSync } from '../../../electron/attachments/resourceResolver.js';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { loadNodeBodyResolution } from '../../../lib/core/database/nodeBodyResolution.js';
import { loadNodeOwnedArticleResourceNeeds } from '../../../lib/core/sync/nodeOwnedArticleResourceNeeds.js';

import { LOCAL_ROOT_IDS_SQL } from './localRootRecords.js';
import { inPeer, type SimulatorPeer } from './scope.js';

export function defects(peer: SimulatorPeer) {
  const db = peer.sqlite;
  return {
    integrity: db.pragma('quick_check'),
    foreignKeys: db.pragma('foreign_key_check'),
    missingParents: db.prepare(`SELECT v.version_id, v.parent_version_id FROM node_sync_versions v
      LEFT JOIN node_sync_versions p ON p.version_id=v.parent_version_id
      WHERE v.parent_version_id IS NOT NULL AND p.version_id IS NULL
      UNION SELECT e.version_id, e.parent_version_id FROM node_sync_version_parents e
      LEFT JOIN node_sync_versions p ON p.version_id=e.parent_version_id WHERE p.version_id IS NULL`).all(),
    missingHeads: db.prepare(`SELECT n.id, n.current_version_id FROM nodes n
      LEFT JOIN node_sync_versions v ON v.version_id=n.current_version_id
      WHERE n.current_version_id IS NOT NULL AND v.version_id IS NULL`).all(),
    mismatchedHeads: db.prepare(`SELECT n.id, n.current_version_id, v.object_id, n.content, v.body_text
      FROM nodes n JOIN node_sync_versions v ON v.version_id=n.current_version_id
      WHERE n.deleted_at IS NULL AND (v.object_id<>n.id OR
      (v.body_text IS NOT NULL AND v.body_text<>COALESCE((SELECT CAST(data AS TEXT)
        FROM content_blob_data WHERE hash=n.body_blob_hash),n.content)))`).all()
  };
}
export function assertHealthy(peer: SimulatorPeer, existingGaps: readonly unknown[] = []) {
  const report = defects(peer);
  expect(report.integrity).toEqual([{ quick_check: 'ok' }]);
  expect(report.foreignKeys).toEqual([]);
  const allowed = new Set(existingGaps.map((row) => JSON.stringify(row)));
  expect(report.missingParents.filter((row) => !allowed.has(JSON.stringify(row)))).toEqual([]);
  expect(report.missingHeads).toEqual([]);
  expect(report.mismatchedHeads).toEqual([]);
}
export function assertBody(peer: SimulatorPeer, content: string, id = 'topic', version?: string) {
  expect(loadNodeBodyResolution(peer.driver, id)).toMatchObject({ status: 'resolved', content });
  const row = peer.sqlite.prepare('SELECT current_version_id FROM nodes WHERE id=?').get(id) as { current_version_id: string };
  if (version) expect(row.current_version_id).toBe(version);
  const body = peer.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id=?').pluck().get(row.current_version_id);
  expect(body).toBe(content);
}
export async function assertCompleted(peer: SimulatorPeer, missingKeys: ReadonlySet<string> = new Set()) {
  const db = peer.sqlite;
  expect(db.prepare('SELECT COUNT(*) FROM node_version_inbound_receipts WHERE delivered_at IS NOT NULL').pluck().get()).toBe(0);
  expect(db.prepare(`SELECT COUNT(*) FROM node_version_pack_receipts receipt WHERE NOT EXISTS
    (SELECT 1 FROM node_version_outbound_holds hold WHERE hold.pack_id = receipt.pack_id
      AND hold.object_id = receipt.object_id)`).pluck().get()).toBe(0);
  expect(db.prepare('SELECT * FROM sync_pack_receive_progress WHERE completed<>1 OR cursor_state_seq<>frontier_state_seq').all()).toEqual([]);
  expect(db.prepare('SELECT count(*) FROM sync_pack_dependency_rows').pluck().get()).toBe(0);
  const pending = db.prepare('SELECT article_id FROM sync_pack_resource_articles').all() as { article_id: string }[];
  if (pending.length) {
    // Production retains an incomplete article batch until its remaining demands are available.
    const demand = await loadNodeOwnedArticleResourceNeeds(createBetterSqliteDbPort(db), pending.map((row) => row.article_id));
    expect(demand.unreadableArticleIds).toEqual([]);
    const absent = demand.needs.filter((need) => inPeer(peer, () => resolveAttachmentFileForSync(need.storageKey).status !== 'ready'));
    expect(absent.length).toBeGreaterThan(0);
    expect(absent.filter((need) => !missingKeys.has(need.storageKey))).toEqual([]);
  }
  const nodes = db.prepare('SELECT id FROM nodes WHERE deleted_at IS NULL AND body_blob_hash IS NOT NULL').all() as { id: string }[];
  for (const node of nodes) expect(loadNodeBodyResolution(peer.driver, node.id)?.status).toBe('resolved');
}
export function state(peer: SimulatorPeer) {
  const table = (name: string, order: string) => peer.sqlite.prepare(`SELECT * FROM ${name} ORDER BY ${order}`).all();
  return {
    nodes: table('nodes', 'id'), versions: table('node_sync_versions', 'version_id'),
    parents: table('node_sync_version_parents', 'version_id, ordinal'),
    alternatives: table('node_text_alternatives', 'alternative_id'),
    progress: table('sync_pack_receive_progress', 'peer_id'),
    delivery: table('sync_delivery_receipts', 'peer_id, operation_id'),
    inboundReceipts: table('node_version_inbound_receipts', 'pack_id'),
    resourceArticles: table('sync_pack_resource_articles', 'article_id')
  };
}
export function stateSummary(peer: SimulatorPeer) {
  const tables = ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'node_text_alternatives',
    'content_blob_data', 'sync_pack_dependency_rows', 'sync_delivery_receipts',
    'node_version_inbound_receipts', 'node_version_pack_receipts', 'node_version_confirmation_state'];
  return { database: peer.dbPath, assets: peer.assets,
    counts: Object.fromEntries(tables.map((table) => [table,
      peer.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()])),
    progress: peer.sqlite.prepare('SELECT * FROM sync_pack_receive_progress ORDER BY peer_id').all(),
    resourceArticles: peer.sqlite.prepare('SELECT * FROM sync_pack_resource_articles ORDER BY article_id').all() };
}
export function addedDefects(before: ReturnType<typeof defects>, after: ReturnType<typeof defects>) {
  return Object.fromEntries(Object.entries(after).map(([key, rows]) => {
    const previous = new Set((before[key as keyof typeof before] as unknown[]).map((row) => JSON.stringify(row)));
    return [key, (rows as unknown[]).filter((row) => !previous.has(JSON.stringify(row)))];
  }));
}
export function graph(peer: SimulatorPeer) {
  return {
    nodes: peer.sqlite.prepare(`SELECT id,kind,title,body_blob_hash,current_version_id,deleted_at,resource_references
      FROM nodes WHERE id NOT IN (${LOCAL_ROOT_IDS_SQL}) ORDER BY id`).all(),
    versions: peer.sqlite.prepare(`SELECT version_id,object_id,parent_version_id,content_hash
      FROM node_sync_versions WHERE object_id NOT IN (${LOCAL_ROOT_IDS_SQL}) ORDER BY version_id`).all(),
    parents: peer.sqlite.prepare(`SELECT p.* FROM node_sync_version_parents p JOIN node_sync_versions v
      ON v.version_id=p.version_id WHERE v.object_id NOT IN (${LOCAL_ROOT_IDS_SQL}) ORDER BY p.version_id,p.ordinal`).all(),
    alternatives: peer.sqlite.prepare(`SELECT node_id,source_version_id,body_text,status
      FROM node_text_alternatives WHERE node_id NOT IN (${LOCAL_ROOT_IDS_SQL}) ORDER BY node_id,source_version_id`).all()
  };
}
export function convergenceState(peer: SimulatorPeer) {
  const { nodes, alternatives } = graph(peer);
  return { nodes: nodes.map((row) => {
    const node = { ...row as Record<string, unknown> };
    delete node.body_blob_hash;
    return { ...node, content: resolvedBodyContent(peer, String(node.id)) };
  }), alternatives, tombstones: peer.sqlite.prepare(`SELECT node_id, version_id, content_hash,
    snapshot_json, deleted_at FROM node_sync_tombstones ORDER BY node_id`).all() };
}
function resolvedBodyContent(peer: SimulatorPeer, id: string) {
  const resolution = loadNodeBodyResolution(peer.driver, id);
  expect(resolution?.status).toBe('resolved');
  if (resolution?.status !== 'resolved') throw new Error(`simulator_body_unavailable:${id}`);
  return resolution.content;
}
export function assertSharedVersionIdentities(a: SimulatorPeer, b: SimulatorPeer) {
  const identities = (peer: SimulatorPeer) => graph(peer).versions as {
    version_id: string; object_id: string; content_hash: string;
  }[];
  const source = new Map(identities(a).map((version) => [version.version_id, version]));
  for (const version of identities(b)) {
    const shared = source.get(version.version_id);
    if (shared) expect(version).toMatchObject({ object_id: shared.object_id, content_hash: shared.content_hash });
  }
}
export async function assertResources(source: SimulatorPeer, target: SimulatorPeer, missingKeys: ReadonlySet<string> = new Set()) {
  const ids = source.sqlite.prepare(`SELECT id FROM nodes WHERE deleted_at IS NULL AND id NOT IN (${LOCAL_ROOT_IDS_SQL})`).pluck().all() as string[];
  for (const id of ids) expect(resolvedBodyContent(target, id)).toBe(resolvedBodyContent(source, id));
  const demand = await loadNodeOwnedArticleResourceNeeds(createBetterSqliteDbPort(source.sqlite), ids);
  expect(demand.unreadableArticleIds).toEqual([]);
  for (const { storageKey: name } of demand.needs) {
    if (inPeer(source, () => resolveAttachmentFileForSync(name).status !== 'ready')) {
      expect(missingKeys.has(name)).toBe(true);
      continue;
    }
    const sourceBytes = await fs.readFile(`${source.assets}/${name}`);
    const targetBytes = await fs.readFile(`${target.assets}/${name}`);
    expect(createHash('sha256').update(targetBytes).digest('hex')).toBe(createHash('sha256').update(sourceBytes).digest('hex'));
  }
}
