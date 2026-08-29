import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { persistCreatedNodeImageAttachment } from '../attachments/persistCreatedNodeImageAttachment.js';
import { upsertVersionedNodeSnapshotWithOrder } from '../database/nodeVersionedMutations.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import { parseNodeCreationMutationArgs } from './commandParsers.js';
import { completeCreatedNodeCreation } from './storageNodeMutationResult.js';

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
      !parsed.node.content.includes(`asset://${args.attachmentId}.png`) || typeof locator?.page !== 'number' ||
      locator.attachmentId !== undefined || locator.rects?.length !== 1) {
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
