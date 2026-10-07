import type { CanonicalManifest } from './framedSyncCanonicalManifest.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';

/** Old publications retain the selected facts, even when their original index is gone. */
export function recoverLegacyPublicationInventory(manifest: CanonicalManifest): FramedSyncInventoryDifference {
  const first = manifest.facts[0];
  if (!first) throw new Error('framed_sync_legacy_publication_empty');
  const objectType = first.objectType === 'node_reading' ? 'node' : first.objectType;
  if (manifest.facts.some((fact) => fact.globalId !== first.globalId ||
      (fact.objectType !== objectType && !(objectType === 'node' && fact.objectType === 'node_reading')))) {
    throw new Error('framed_sync_legacy_publication_multiple_objects');
  }
  const versions = manifest.facts.filter((fact) => fact.kind === 2);
  const states = manifest.facts.filter((fact) => fact.kind === 1);
  const node = objectType === 'node';
  const sourceSnapshot = { globalId: first.globalId, objectType,
    frontierFactIds: versions.map((fact) => fact.factId),
    requiredRelationIds: manifest.facts.filter((fact) => fact.kind === 3).map((fact) => fact.factId),
    reviewFactIds: manifest.facts.filter((fact) => fact.kind === 4).map((fact) => fact.factId),
    stateFactIds: states.map((fact) => fact.factId),
    resourceHashes: manifest.blobs.filter((blob) => blob.required).map((blob) => blob.sha256),
    sharedStateHash: (node ? versions.at(-1) : states[0])?.sharedStateHash ?? new Uint8Array(32) };
  return { direction: 'local_to_remote', globalId: first.globalId, objectType, sourceSnapshot,
    need: { ...sourceSnapshot, sharedState: node ? versions.length > 0 : states.length > 0 } };
}
