import type { DbPort } from './dbPort.js';
import { assertFramedSyncNodeParentDependencies } from './framedSyncNodeParentDependencies.js';
import { alreadyProjectedRequestSyncVersions, withRequestSyncCurrentVersion, withRequestSyncCurrentVersions,
  type RequestSyncCurrentVersion } from './requestSyncCurrentVersion.js';
import { requestSyncNodeSource } from './requestSyncNodeGraph.js';
import type { SyncNodeRecordMetadata, SyncNodeRecordSource } from './syncNodeRecordSource.js';

type NodePreparationOptions = {
  requireCompleteVersionGraph?: boolean;
  currentVersion?: RequestSyncCurrentVersion;
  currentVersions?: { references: readonly RequestSyncCurrentVersion[] };
  rejectedNodes?: Map<string, string>;
};

export async function prepareFramedNodeApplication(tx: DbPort, received: SyncNodeRecordSource, options: NodePreparationOptions) {
  const rejected = options.rejectedNodes;
  const validated = options.requireCompleteVersionGraph ? await requestSyncNodeSource(tx, received, rejected) : received;
  await assertFramedSyncNodeParentDependencies(tx, validated.records.filter(record => !validated.isIdentityOnly(record)), rejected);
  const eligible = { ...validated, records: validated.records.filter(record => !rejected?.has(record.object_id)) };
  const references = options.currentVersions?.references.filter(reference => !rejected?.has(reference.globalId));
  const inBatchHeads = rejected && references && await selectReceivedHeads(tx, eligible, references);
  const selected = inBatchHeads || (references
    ? await withRequestSyncCurrentVersions(tx, eligible, references, rejected)
    : await withRequestSyncCurrentVersion(tx, eligible, options.currentVersion));
  const hasStoredReference = selected.records.some(record => !eligible.records.includes(record));
  const prepared = await prepareProjectionSources(tx, selected, eligible, rejected, hasStoredReference);
  if (!hasStoredReference) return prepared;
  await assertFramedSyncNodeParentDependencies(tx, prepared.nodeSource.records, rejected);
  return { nodeSource: { ...prepared.nodeSource, records: prepared.nodeSource.records.filter(record => !rejected?.has(record.object_id)) },
    historySource: { ...prepared.historySource, records: prepared.historySource.records.filter(record => !rejected?.has(record.object_id)) } };
}

async function prepareProjectionSources(tx: DbPort, selected: SyncNodeRecordSource, validated: SyncNodeRecordSource,
  rejected: ReadonlyMap<string, string> | undefined, hasStoredReference: boolean) {
  if (!rejected) {
    const source = hasStoredReference ? await requestSyncNodeSource(tx, selected) : selected;
    return { nodeSource: source, historySource: source };
  }
  const incoming = validated.records.filter(record => !rejected.has(record.object_id));
  if (!hasStoredReference) return { nodeSource: selected, historySource: { ...validated, records: incoming } };
  const incomingRecords = new Set(incoming);
  const owner = (record: SyncNodeRecordMetadata) => incomingRecords.has(record) ? validated : selected;
  const key = (record: SyncNodeRecordMetadata) => JSON.stringify([record.object_id, record.version_id]);
  const projected = new Set(selected.records.map(key));
  const historySource = await requestSyncNodeSource(tx, {
    records: [...incoming, ...selected.records.filter(record => !incomingRecords.has(record))],
    load: (db, record) => owner(record).load(db, record),
    isIdentityOnly: record => owner(record).isIdentityOnly(record)
  });
  return { historySource, nodeSource: { ...historySource, records: historySource.records.filter(record => projected.has(key(record))) } };
}

async function selectReceivedHeads(db: DbPort, source: SyncNodeRecordSource,
  references: readonly RequestSyncCurrentVersion[]) {
  const byNode = new Map(references.map(({ globalId, versionId }) => [globalId, versionId]));
  const records = source.records.filter(record => {
    const head = byNode.get(record.object_id);
    return !head || (record.version_id === head && !source.isIdentityOnly(record));
  });
  const selected = new Set(records.map(record => record.object_id));
  const retained = references.filter(({ globalId }) => !selected.has(globalId));
  const incomingIds = new Set(source.records.flatMap(record => record.version_id ? [record.version_id] : []));
  // A body-free identity fact is neither a received head nor a reference to a head omitted from the payload.
  if (retained.some(({ versionId }) => incomingIds.has(versionId)) || !await alreadyProjectedRequestSyncVersions(db, retained)) return null;
  return { ...source, records };
}
