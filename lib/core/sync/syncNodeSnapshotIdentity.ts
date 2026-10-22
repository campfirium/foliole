import { z } from 'zod';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { FRAMED_SYNC_NODE_VERSION_FACT } from './framedSyncNodeFactContract.js';

const snapshotObject = z.record(z.string(), z.unknown());
const fields = FRAMED_SYNC_NODE_VERSION_FACT.snapshotFields.filter(name => name !== 'body_blob_hash');

/** Taken from the text; a permanent deletion clears them together with it. */
const TEXT_DERIVED_FIELDS = new Set(['opening_text', 'title']);

function metadata(snapshot: Record<string, unknown>, withoutText: boolean) {
  const values = Object.fromEntries(fields.filter(name => !withoutText || !TEXT_DERIVED_FIELDS.has(name))
    .map(name => [name, snapshot[name] ?? null]));
  return JSON.stringify(values, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  });
}

/** Payload reclamation and optional wire defaults do not change an original version's metadata. */
export function isSyncNodeSnapshotIdentical(stored: string, incoming: NativeSyncNodeRecord['snapshot']) {
  const left = snapshotObject.parse(JSON.parse(stored));
  const right = snapshotObject.parse(incoming);
  const withoutText = left.body_deleted === true || right.body_deleted === true;
  return metadata(left, withoutText) === metadata(right, withoutText);
}
