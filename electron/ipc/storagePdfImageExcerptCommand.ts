import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { persistCreatedNodeImageAttachment } from '../attachments/persistCreatedNodeImageAttachment.js';
import { upsertVersionedNodeSnapshotWithOrder } from '../database/nodeVersionedMutations.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import { parseNodeCreationMutationArgs } from './commandParsers.js';
import { completeCreatedNodeCreation } from './storageNodeMutationResult.js';

function isPdfExcerptLocator(locator: { attachmentId?: string; from?: number; originalText?: string; page?: number; rects?: unknown[]; to?: number } | undefined) {
  return typeof locator?.page === 'number' && locator.attachmentId === undefined && locator.rects?.length === 1;
}

function isAttachmentExcerptLocator(
  locator: { from?: number; originalText?: string; page?: number; to?: number } | undefined,
  imageRegions: Array<{ attachmentId: string; regions: unknown[] }> | null
) {
  if (typeof locator?.from !== 'number' || typeof locator.to !== 'number' || typeof locator.originalText !== 'string' || locator.page !== undefined) {
    return false;
  }
  return imageRegions?.length === 1 && imageRegions[0]?.regions.length === 1 &&
    locator.originalText.includes(`asset://${imageRegions[0].attachmentId}`);
}

export async function handleStoragePdfImageExcerptCommand(
  command: string,
  args: Record<string, unknown>,
  originWindow: Parameters<typeof completeCreatedNodeCreation>[1]
) {
  if (command !== NATIVE_COMMANDS.createPdfImageExcerpt) return undefined;
  const parsed = parseNodeCreationMutationArgs(args, 'topic');
  const anchor = parsed.node.anchorLink;
  const locator = anchor?.locator as { attachmentId?: string; page?: number; rects?: unknown[] } | undefined;
  if (anchor?.kind !== 'image-excerpt' || typeof args.bytesBase64 !== 'string' || typeof args.attachmentId !== 'string' ||
      !parsed.node.content.includes(`asset://${args.attachmentId}.png`) ||
      (!isPdfExcerptLocator(locator) && !isAttachmentExcerptLocator(locator, parsed.node.imageRegions))) {
    throw new Error('invalid argument: image excerpt');
  }
  await persistCreatedNodeImageAttachment({
    bytes: Buffer.from(args.bytesBase64, 'base64'),
    expectedHash: args.attachmentId,
    mimeType: 'image/png',
    nodeId: parsed.node.nodeId,
    originalName: typeof args.originalName === 'string' ? args.originalName : 'pdf-image-excerpt.png',
    persistNode: () => upsertVersionedNodeSnapshotWithOrder(parsed.node, parsed.nodeOrder)
  });
  scheduleMirrorSync([parsed.node.nodeId]);
  return completeCreatedNodeCreation(parsed, originWindow);
}
