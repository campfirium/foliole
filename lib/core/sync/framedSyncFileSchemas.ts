import { z } from 'zod';

import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';

export const framedFileBytes = z.array(z.number().int().min(0).max(255)).transform((value): Uint8Array => Uint8Array.from(value));
export const framedFileDigest = z.array(z.number().int().min(0).max(255)).length(32).transform((value): Uint8Array => Uint8Array.from(value));
export const framedFileUnsigned = z.string().regex(/^\d+$/u).transform(BigInt);
export const framedFileContext = z.object({ protocolVersion: z.literal(FRAMED_SYNC_PROTOCOL_VERSION), groupId: z.string().min(1),
  senderDeviceId: z.string().min(1), senderLibraryEpoch: z.string().min(1),
  receiverDeviceId: z.string().min(1), receiverLibraryEpoch: z.string().min(1) });
export const framedFileReceipt = z.object({ transferId: framedFileDigest, contentId: framedFileDigest,
  receiverDeviceId: z.string().min(1), receiverLibraryEpoch: z.string().min(1), appliedStateHash: framedFileDigest });
export const framedFileBlob = z.object({ sha256: framedFileDigest, byteLength: framedFileUnsigned,
  role: z.number().int(), required: z.boolean() });
export const framedFileProposal = z.object({ transferId: framedFileDigest, contentId: framedFileDigest,
  context: framedFileContext, factCount: framedFileUnsigned, blobCount: framedFileUnsigned,
  totalBlobBytes: framedFileUnsigned });
export const framedFileHeader = z.object({ attemptId: framedFileBytes,
  proposal: framedFileProposal, published: framedFileProposal.extend({ manifestHash: framedFileDigest }),
  reservationId: z.string().min(1), blobs: z.array(framedFileBlob), facts: z.array(z.object({
    factId: z.string(), globalId: z.string(), kind: z.number().int(), objectType: z.string(),
    requiredBlobHashes: z.array(framedFileDigest), sharedStateHash: framedFileDigest })) });
