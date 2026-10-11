import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import type { PublishedTransfer } from './framedSyncContract.js';
import type { InboundHeaderDeclarationInput } from './framedSyncStagingContract.js';

export type FramedSyncReadySource = Pick<PublishedTransfer, 'context' | 'contentId' | 'manifestHash' | 'transferId'> & Readonly<{
  attemptId: Uint8Array;
  blobs: InboundHeaderDeclarationInput['blobs'];
  entries: readonly Readonly<{ sequence: string; descriptor: Omit<CanonicalFact, 'body'>; fingerprint: string }>[];
  globalId: string;
  objectType: string;
}>;
