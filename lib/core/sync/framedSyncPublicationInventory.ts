import { z } from 'zod';

import type { CanonicalManifest } from './framedSyncCanonicalManifest.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';

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
