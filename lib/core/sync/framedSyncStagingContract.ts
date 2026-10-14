import type { CanonicalManifest } from './framedSyncCanonicalManifest.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';

export type OutboundPublishInput = Readonly<{
  inventoryDifference?: FramedSyncInventoryDifference;
  contentId: Uint8Array;
  context: FramedSyncContext;
  manifest: CanonicalManifest;
  manifestHash: Uint8Array;
  transferId: Uint8Array;
}>;
