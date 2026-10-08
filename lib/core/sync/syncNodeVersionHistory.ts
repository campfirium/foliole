import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { buildRemoteNodeVersionUpsert } from './syncNodeApplyStatements.js';
import { arraySyncNodeRecordSource, type SyncNodeRecordMetadata, type SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { hasCompleteTombstoneVersion } from './syncNodeTombstoneVersion.js';
import { includeLegacyVersionParents, validateStoredVersionDependencies } from './syncPackNodeVersionDependencyValidation.js';

export function isNodeVersionIdentityOnly(record: SyncNodeRecordMetadata & { body_text?: string | null;
  snapshot: SyncNodeRecordMetadata['snapshot'] & { content?: string | null } }) {
  return !record.is_tombstone && record.body_text === null && record.snapshot.content === null;
}

type VersionParentMetadata = Pick<NativeSyncNodeRecord, 'version_id' | 'parent_version_id' | 'parent_version_ids'>;

function parentIds(record: VersionParentMetadata) {
  return record.parent_version_ids ?? (record.parent_version_id ? [record.parent_version_id] : []);
}

export function orderNodeVersionHistory<T extends VersionParentMetadata>(records: T[]): T[] {
  const byId = new Map(records.filter((record) => record.version_id)
    .map((record) => [record.version_id!, record]));
  const ordered: T[] = [];
  const visited = new Set<T>();
  const visiting = new Set<T>();
  function visit(record: T) {
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

export function prepareIncomingNodeVersionHistory(port: DbPort, records: NativeSyncNodeRecord[]) {
  return prepareIncomingNodeVersionSource(port, arraySyncNodeRecordSource(records));
}

export async function prepareIncomingNodeVersionSource<M extends SyncNodeRecordMetadata>(port: DbPort, source: SyncNodeRecordSource<M>) {
  const eligible: M[] = [];
  for (const metadata of source.records) {
    const record = await source.load(port, metadata);
    if (!buildRemoteNodeVersionUpsert(record) || record.is_tombstone && !hasCompleteTombstoneVersion(record)) continue;
    eligible.push(metadata);
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

export async function retainIncomingNodeVersionSource<M extends SyncNodeRecordMetadata>(port: DbPort,
  source: SyncNodeRecordSource<M>, records: readonly M[]) {
  for (const metadata of records) await upsertRemoteVersion(port, await source.load(port, metadata));
}

export async function retainIncomingNodeVersionHistory(port: DbPort, records: NativeSyncNodeRecord[]) {
  for (const record of records) await upsertRemoteVersion(port, record);
}
