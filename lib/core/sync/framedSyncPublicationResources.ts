import type { CanonicalManifest } from './framedSyncCanonicalManifest.js';
import { readFramedSyncNodeResources } from './framedSyncNodeResources.js';

/** Resource addresses come from the immutable publication, never the current Node. */
export function framedSyncPublicationResources(manifest: CanonicalManifest) {
  const resources = new Map<string, ReturnType<typeof readFramedSyncNodeResources>[number]>();
  for (const fact of manifest.facts) {
    const snapshot = fact.body.find((field) => field.name === 'snapshot')?.value;
    if (snapshot?.kind !== 'object') continue;
    const references = snapshot.value.find((field) => field.name === 'resource_references')?.value;
    if (references?.kind !== 'string') continue;
    for (const resource of readFramedSyncNodeResources(references.value)) {
      const prior = resources.get(resource.contentHash);
      if (prior && prior.storageKey !== resource.storageKey) {
        throw new Error('framed_sync_outbound_resource_identity_conflict');
      }
      resources.set(resource.contentHash, resource);
    }
  }
  return resources;
}
