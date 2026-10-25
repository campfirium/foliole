import { z } from 'zod';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { FRAMED_SYNC_NODE_VERSION_FACT } from './framedSyncNodeFactContract.js';

const snapshotObject = z.record(z.string(), z.unknown());
const fields = [...FRAMED_SYNC_NODE_VERSION_FACT.snapshotFields, ...FRAMED_SYNC_NODE_VERSION_FACT.optionalSnapshotFields]
  .filter(name => name !== 'body_blob_hash');

/** Taken from the text; a permanent deletion clears them together with it. */
const TEXT_DERIVED_FIELDS = new Set(['opening_text', 'title']);

const isCleared = (value: unknown) => value === null || value === undefined || value === '';

function metadata(snapshot: Record<string, unknown>, skipped: ReadonlySet<string>) {
  const values = Object.fromEntries(fields.filter(name => !skipped.has(name))
    .map(name => [name, snapshot[name] ?? null]));
  return JSON.stringify(values, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  });
}

/**
 * Payload reclamation and optional wire defaults do not change an original version's metadata. A
 * text-derived field is skipped only once one side has actually cleared it with the text; a version
 * whose body was merely retired from history keeps its title and still has to match it.
 */
export function isSyncNodeSnapshotIdentical(stored: string, incoming: NativeSyncNodeRecord['snapshot'],
  ignored: readonly string[] = []) {
  const left = snapshotObject.parse(JSON.parse(stored));
  const right = snapshotObject.parse(incoming);
  const withoutText = left.body_deleted === true || right.body_deleted === true;
  const skipped = new Set([...ignored, ...withoutText ? [...TEXT_DERIVED_FIELDS]
    .filter(name => isCleared(left[name]) || isCleared(right[name])) : []]);
  return metadata(left, skipped) === metadata(right, skipped);
}
