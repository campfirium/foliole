import type { CanonicalFact, CanonicalValue } from '../../lib/core/sync/framedSyncCanonicalManifest.js';

/** A pre-retirement wire snapshot, kept independently of the current outbound selector. */
export function legacyReviewFact(nodeId: string, deleted: boolean, standalone = false): CanonicalFact {
  const hash = 'f'.repeat(64);
  const string = (value: string): CanonicalValue => ({ kind: 'string', value });
  return { kind: 1, objectType: standalone ? 'node_review' : 'node', globalId: nodeId,
    factId: standalone ? `node_review:${hash}` : JSON.stringify(['node_review', nodeId, hash]),
    sharedStateHash: new Uint8Array(32).fill(255), blobs: [], body: [
      { name: 'content_hash', value: string(hash) },
      { name: 'current_version_id', value: { kind: 'null' } },
      { name: 'deleted_at', value: deleted ? string('2026-10-10T00:00:00.000Z') : { kind: 'null' } },
      { name: 'payload_json', value: deleted ? { kind: 'null' } : string('{"reps":999,"due":"2099-01-01T00:00:00.000Z"}') },
      { name: 'updated_at', value: string('2026-10-10T00:00:00.000Z') }
    ] };
}
