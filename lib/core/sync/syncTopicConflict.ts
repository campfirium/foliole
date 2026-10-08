import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from './syncNodeGraph.js';
import { selectNodeOperationValue } from './syncNodeOperationValue.js';
import type { SyncNodeRecordMetadata, SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { buildResolutionRecord, chooseEvidenceProjection, chooseProjection } from './syncNodeResolution.js';
import { mergedTopicTextSourceBodies } from './topicTextBodies.js';
import { loadTopicTextConflictMetadata, selectChangedTopicMain } from './topicTextConflictMetadata.js';
import { mergeTopicTextSourceAttachments } from './topicTextMerge.js';

export async function resolveTopicSourceConflict<M extends SyncNodeRecordMetadata>(port: DbPort,
  source: SyncNodeRecordSource<M>, collectVersionPayloads = true) {
  let ordered = [...source.records].sort((left, right) => (left.version_id ?? '').localeCompare(right.version_id ?? ''));
  const local = await loadCurrentSyncNodeRecord(port, ordered[0]!.object_id);
  if (!local?.version_id || ordered.some((record) => !record.version_id)) {
    throw new Error(`sync_topic_conflict_version_missing:${ordered[0]!.object_id}`);
  }
  ordered = ordered.filter((record) => record.version_id !== local.version_id &&
    !local.ancestor_version_ids.includes(record.version_id!));
  if (!ordered.length) return local;
  const incoming = { ...source, records: ordered };
  const { body, winner, parent, deletion } = await selectTopicState(port, local, incoming);
  const currentSnapshot = { ...winner.snapshot };
  delete currentSnapshot.position;
  const records: SyncNodeRecordMetadata[] = [local, ...ordered];
  const loaders = new Map<SyncNodeRecordMetadata, (db: DbPort) => Promise<NativeSyncNodeRecord>>([
    [local, () => Promise.resolve(local)],
    ...ordered.map((metadata) => [metadata, (db: DbPort) => source.load(db, metadata)] as const)
  ]);
  const completeSource: SyncNodeRecordSource = { records, isIdentityOnly: () => false,
    load: (db, metadata) => loaders.get(metadata)!(db) };
  const resolution = buildResolutionRecord(records, winner, body, {
    ...currentSnapshot, deleted_at: deletion.value, parent_id: parent.value,
    text_selection: winner.snapshot.text_selection ?? {
      version_id: winner.version_id!, created_at: winner.version_created_at!
    }, text_alternatives: []
  });
  resolution.snapshot.text_alternatives = resolution.snapshot.deleted_at ? [] :
    await mergeTopicTextSourceAttachments(port, completeSource, winner, new Date().toISOString());
  const complete = buildResolutionRecord(records, winner, body, resolution.snapshot);
  complete.alternative_bodies = await mergedTopicTextSourceBodies(port, complete.snapshot.text_alternatives ?? [], completeSource);
  const applied = await applySyncNodesWithDbPort(port, [complete], {
    enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation: 'local_mutation'
  });
  if (!applied.appliedIds.includes(local.object_id)) throw new Error(`sync_topic_resolution_not_applied:${local.object_id}`);
  if (collectVersionPayloads) await collectNodeVersionPayloads(port, local.object_id, Number.MAX_SAFE_INTEGER);
  return complete;
}

async function selectTopicState<M extends SyncNodeRecordMetadata>(port: DbPort, local: NativeSyncNodeRecord,
  source: SyncNodeRecordSource<M>) {
  let body = local.body_text ?? local.snapshot.content ?? '';
  let winner = local;
  let parent = { value: local.snapshot.parent_id, source: local as SyncNodeRecordMetadata };
  let deletion = { value: local.snapshot.deleted_at, source: local as SyncNodeRecordMetadata };
  for (const metadata of source.records) {
    const incoming = await source.load(port, metadata);
    const baseSnapshot = await loadTopicTextConflictMetadata(port, local, incoming);
    parent = selectNodeOperationValue(baseSnapshot?.parent_id, parent, metadata.snapshot.parent_id, metadata);
    deletion = selectNodeOperationValue(baseSnapshot?.deleted_at, deletion, metadata.snapshot.deleted_at, metadata);
    if (body === (incoming.body_text ?? incoming.snapshot.content ?? '')) {
      winner = chooseProjection(winner, incoming, '', 0, 0);
      continue;
    }
    const changed = await selectChangedTopicMain(port, winner, incoming);
    const projection = changed ? { winner: changed, body: changed.body_text ?? changed.snapshot.content ?? '' }
      : await chooseEvidenceProjection(port, winner, incoming, '');
    body = projection.body;
    winner = projection.winner;
  }
  return { body, winner, parent, deletion };
}
