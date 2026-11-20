import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

import { openDatabaseConnection } from '../database/connection.js';
import { persistNodeResourceReference } from '../database/nodeResources.js';

import { publishImmutableAttachmentBytes } from './publishImmutableAttachment.js';
import { resolveAttachmentStoragePath } from './resourceResolver.js';
import { validateSupportedImageBytes } from './supportedImageFormats.js';

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

export async function persistCreatedNodeImageAttachment(args: {
  bytes: Uint8Array;
  expectedHash: string;
  mimeType: 'image/png';
  nodeId: string;
  originalName: string;
  persistNode: () => void;
}) {
  if (args.bytes.byteLength === 0 || args.bytes.byteLength > MAX_IMAGE_BYTES ||
      !validateSupportedImageBytes(args.bytes, args.mimeType)) {
    throw new Error('invalid argument: image bytes');
  }
  const hash = createHash('sha256').update(args.bytes).digest('hex');
  if (hash !== args.expectedHash) throw new Error('invalid argument: image hash');
  const originalName = args.originalName.trim() || 'pdf-image-excerpt.png';
  const storagePath = resolveAttachmentStoragePath(hash, undefined, args.mimeType);
  const createdFile = await publishImmutableAttachmentBytes(storagePath, hash, args.bytes);
  try {
    openDatabaseConnection().driver.transaction(() => {
      args.persistNode();
      persistNodeResourceReference(args.nodeId, {
        storage_key: `${hash}.png`, original_name: originalName, role: 'image'
      });
    });
  } catch (error) {
    if (createdFile) await fs.unlink(storagePath).catch(() => undefined);
    throw error;
  }
  return hash;
}
