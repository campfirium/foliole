import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { buildRemoteNodeVersionUpsert } from './syncNodeApplyStatements.js';
import { includeLegacyVersionParents, validateStoredVersionDependencies } from './syncPackNodeVersionDependencyValidation.js';

export function isNodeVersionIdentityOnly(record: NativeSyncNodeRecord) {
  return !record.is_tombstone && record.body_text === null && record.snapshot.content === null;
}

function parentIds(record: NativeSyncNodeRecord) {
  return record.parent_version_ids ?? (record.parent_version_id ? [record.parent_version_id] : []);
}

export function orderNodeVersionHistory(records: NativeSyncNodeRecord[]) {
  const byId = new Map(records.filter((record) => record.version_id)
    .map((record) => [record.version_id!, record]));
  const ordered: NativeSyncNodeRecord[] = [];
  const visited = new Set<NativeSyncNodeRecord>();
  const visiting = new Set<NativeSyncNodeRecord>();
  function visit(record: NativeSyncNodeRecord) {
    if (visited.has(record)) return;
    if (visiting.has(record)) throw new Error(`sync_node_version_cycle:${record.version_id}`);
    visiting.add(record);
    for (const id of parentIds(record)) {
      const parent = byId.get(id);
      if (parent) visit(parent);
    }
    visiting.delete(record);
    visited.add(record);
    ordered.push(record);
  }
  records.forEach(visit);
  return ordered;
}

export async function prepareIncomingNodeVersionHistory(port: DbPort, records: NativeSyncNodeRecord[]) {
  const eligible: NativeSyncNodeRecord[] = [];
  const blocked = new Map<string, boolean>();
  for (const record of records) {
    if (record.is_tombstone || !buildRemoteNodeVersionUpsert(record)) continue;
    if (!blocked.has(record.object_id)) {
      const tombstones = await port.query('SELECT 1 FROM node_sync_tombstones WHERE node_id = ?', [record.object_id]);
      blocked.set(record.object_id, tombstones.length > 0);
    }
    if (!blocked.get(record.object_id)) eligible.push(record);
  }
  const ordered = orderNodeVersionHistory(eligible);
  const identities = ordered.map((record) => ({ object_id: record.object_id,
    parent_version_id: record.parent_version_id, version_id: record.version_id! }));
  const parents = ordered.flatMap((record) => parentIds(record).map((id, ordinal) => ({
    version_id: record.version_id!, parent_version_id: id, ordinal
  })));
  await validateStoredVersionDependencies(port, identities, includeLegacyVersionParents(identities, parents));
  return ordered;
}

export async function retainIncomingNodeVersionHistory(port: DbPort, records: NativeSyncNodeRecord[]) {
  const present = new Map<string, boolean>();
  for (const record of records) {
    if (!present.has(record.object_id)) {
      const nodes = await port.query('SELECT 1 FROM nodes WHERE id = ?', [record.object_id]);
      present.set(record.object_id, nodes.length > 0);
    }
    if (present.get(record.object_id)) await upsertRemoteVersion(port, record);
  }
}
