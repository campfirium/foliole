import { z } from 'zod';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { FRAMED_SYNC_NODE_VERSION_FACT } from './framedSyncNodeFactContract.js';

const snapshotObject = z.record(z.string(), z.unknown());
const fields = FRAMED_SYNC_NODE_VERSION_FACT.snapshotFields.filter(name => name !== 'body_blob_hash');

function metadata(snapshot: Record<string, unknown>) {
  const values = Object.fromEntries(fields.map(name => [name, snapshot[name] ?? null]));
  return JSON.stringify(values, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  });
}

/** Payload reclamation and optional wire defaults do not change an original version's metadata. */
export function isSyncNodeSnapshotIdentical(stored: string, incoming: NativeSyncNodeRecord['snapshot']) {
  return metadata(snapshotObject.parse(JSON.parse(stored))) === metadata(snapshotObject.parse(incoming));
}
