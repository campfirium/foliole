import { z } from 'zod';

import type { CanonicalManifest } from './framedSyncCanonicalManifest.js';
import { compareFramedSyncInventories, type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry } from './framedSyncInventory.js';

const ids = z.array(z.string().min(1));
const digest = z.array(z.number().int().min(0).max(255)).length(32)
  .transform((value) => Uint8Array.from(value));
const entry = z.object({ frontierFactIds: ids, globalId: z.string().min(1),
  objectType: z.string().min(1), requiredRelationIds: ids, resourceHashes: z.array(digest),
  reviewFactIds: ids, sharedStateHash: digest, stateFactIds: ids.default([]),
  versionStates: ids.optional(), currentVersionId: z.string().optional(), unready: z.boolean().optional() });
const difference = z.object({ direction: z.literal('local_to_remote'), globalId: z.string().min(1),
  objectType: z.string().min(1), sourceSnapshot: entry,
  need: z.object({ frontierFactIds: ids, requiredRelationIds: ids, resourceHashes: z.array(digest),
    reviewFactIds: ids, sharedState: z.boolean(), stateFactIds: ids.default([]) }) });

export function encodePublicationInventory(manifest: CanonicalManifest,
  inventoryDifference?: FramedSyncInventoryDifference) {
  return JSON.stringify({ ...manifest, inventoryDifference }, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    return value instanceof Uint8Array ? [...value] : value;
  });
}

export function decodePublicationInventory(value: string) {
  const stored = z.object({ inventoryDifference: difference.optional() }).parse(JSON.parse(value));
  return stored.inventoryDifference;
}

/** Reuses the discovery predicate, restricted to the durable original missing set. */
export function recheckPublicationInventory(original: FramedSyncInventoryDifference,
  remote: readonly FramedSyncInventoryEntry[]): FramedSyncInventoryDifference | null {
  const current = compareFramedSyncInventories({ local: [original.sourceSnapshot], remote })
    .find((value) => value.direction === 'local_to_remote');
  if (!current) return null;
  const intersect = (values: readonly string[], selected: readonly string[]) =>
    values.filter((value) => selected.includes(value));
  const need = {
    frontierFactIds: intersect(current.need.frontierFactIds, original.need.frontierFactIds),
    requiredRelationIds: intersect(current.need.requiredRelationIds, original.need.requiredRelationIds),
    reviewFactIds: intersect(current.need.reviewFactIds, original.need.reviewFactIds),
    stateFactIds: intersect(current.need.stateFactIds ?? [], original.need.stateFactIds ?? []),
    resourceHashes: current.need.resourceHashes.filter((hash) => original.need.resourceHashes.some(
      (selected) => selected.every((byte, index) => hash[index] === byte))),
    sharedState: original.need.sharedState && current.need.sharedState
  };
  return need.sharedState || need.frontierFactIds.length || need.requiredRelationIds.length ||
    need.reviewFactIds.length || need.stateFactIds.length || need.resourceHashes.length
    ? { ...original, need } : null;
}
