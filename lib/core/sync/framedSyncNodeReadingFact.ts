import { hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort, DbRow } from './dbPort.js';
import type { CanonicalFact, CanonicalValue } from './framedSyncCanonicalManifest.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from './syncObjectPayloadSql.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

interface StateRow extends DbRow {
  content_hash: string;
  deleted_at: string | null;
  updated_at: string;
}

const field = (name: string, value: CanonicalValue) => ({ name, value });
const string = (value: string): CanonicalValue => ({ kind: 'string', value });
const nullable = (value: string | null): CanonicalValue => value === null
  ? { kind: 'null' }
  : string(value);

export async function selectFramedSyncNodeReadingFact(
  port: DbPort,
  nodeId: string,
  factId: string
): Promise<CanonicalFact> {
  const [state] = await port.query<StateRow>(`SELECT content_hash, deleted_at, updated_at
    FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = ?`, [nodeId]);
  if (!state || factId !== readingFactId(state.content_hash)) {
    throw new Error('framed_sync_source_changed');
  }
  const [payload] = state.deleted_at ? [] : await port.query<{ payload_json: string }>(
    SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.node_reading, [nodeId]
  );
  if (!state.deleted_at && !payload) throw new Error('framed_sync_source_changed');
  return {
    blobs: [],
    body: [
      field('content_hash', string(state.content_hash)),
      field('deleted_at', nullable(state.deleted_at)),
      field('payload_json', nullable(payload?.payload_json ?? null)),
      field('updated_at', string(state.updated_at))
    ],
    factId,
    globalId: nodeId,
    kind: 1,
    objectType: 'node',
    sharedStateHash: hexToBytes(state.content_hash)
  };
}

export function restoreFramedSyncNodeReadingFact(fact: CanonicalFact): SyncPackSyncObjectRecord {
  if (fact.kind !== 1 || fact.objectType !== 'node' ||
      fact.factId !== readingFactId(readString(fact, 'content_hash'))) {
    throw new Error('framed_sync_node_reading_fact_invalid');
  }
  return {
    content_hash: readString(fact, 'content_hash'),
    deleted_at: readNullableString(fact, 'deleted_at'),
    object_id: fact.globalId,
    object_type: 'node_reading',
    payload_json: readNullableString(fact, 'payload_json'),
    updated_at: readString(fact, 'updated_at')
  };
}

function readingFactId(contentHash: string) {
  return `node_reading:${contentHash}`;
}

function value(fact: CanonicalFact, name: string) {
  const found = fact.body.find((item) => item.name === name)?.value;
  if (!found) throw new Error('framed_sync_node_reading_fact_invalid');
  return found;
}

function readString(fact: CanonicalFact, name: string) {
  const found = value(fact, name);
  if (found.kind !== 'string' || !found.value) {
    throw new Error('framed_sync_node_reading_fact_invalid');
  }
  return found.value;
}

function readNullableString(fact: CanonicalFact, name: string) {
  const found = value(fact, name);
  if (found.kind === 'null') return null;
  if (found.kind !== 'string') throw new Error('framed_sync_node_reading_fact_invalid');
  return found.value;
}
