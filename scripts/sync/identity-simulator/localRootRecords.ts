import { expect } from 'vitest';

import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../../lib/core/database/specialNodeIds.js';

import type { SimulatorPeer } from './scope.js';

export const LOCAL_ROOT_IDS_SQL = [INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID].map((id) => `'${id}'`).join(', ');

export function localRootRecords(peer: SimulatorPeer) {
  const roots = `(${LOCAL_ROOT_IDS_SQL})`;
  return {
    nodes: peer.sqlite.prepare(`SELECT * FROM nodes WHERE id IN ${roots} ORDER BY id`).all(),
    versions: peer.sqlite.prepare(`SELECT * FROM node_sync_versions WHERE object_id IN ${roots} ORDER BY version_id`).all(),
    parents: peer.sqlite.prepare(`SELECT p.* FROM node_sync_version_parents p JOIN node_sync_versions v
      ON v.version_id=p.version_id WHERE v.object_id IN ${roots} ORDER BY p.version_id,p.ordinal`).all()
  };
}

export function assertLocalRootsPreserved(peer: SimulatorPeer, before: ReturnType<typeof localRootRecords>) {
  const after = localRootRecords(peer);
  expect(after.versions).toEqual(before.versions);
  expect(after.parents).toEqual(before.parents);
  const priorIds = new Set(before.nodes.map((row) => (row as { id: string }).id));
  expect(after.nodes.filter((row) => priorIds.has((row as { id: string }).id))).toEqual(before.nodes);
  for (const row of after.nodes.filter((node) => !priorIds.has((node as { id: string }).id))) {
    expect(row).toMatchObject({ kind: 'folder', content: '', body_blob_hash: null,
      current_version_id: null, resource_references: '[]', deleted_at: null });
  }
}
