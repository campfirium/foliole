import { createHash } from 'node:crypto';
import fs from 'node:fs';


import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import type { AttachmentResourceDescription } from '../../lib/platform/attachmentResource.js';
import type { NativeAttachmentResourceResolution } from '../../lib/platform/nativeUtilityContract.js';

import { buildAttachmentAssetUrl } from './attachmentAssetUrl.js';
import { readAttachmentLibraryPathSnapshot } from './attachmentLibraryPathSnapshot.js';
import { buildAttachmentStorageFileName, resolveAttachmentStorageKeyPath } from './storagePath.js';

export type ResolvedAttachmentFile =
  | {
      bytes: Buffer;
      filePath: string;
      mimeType: string | null;
      status: 'ready';
    }
  | {
      status: 'missing_file';
      mimeType: string | null;
    }
  | {
      status: 'not_found';
    };

const verifiedFileIdentities = new Set<string>();
const MAX_VERIFIED_FILE_IDENTITIES = 512;

function rememberVerifiedIdentity(identity: string) {
  verifiedFileIdentities.add(identity);
  if (verifiedFileIdentities.size <= MAX_VERIFIED_FILE_IDENTITIES) return;
  const oldest = verifiedFileIdentities.values().next().value;
  if (oldest) verifiedFileIdentities.delete(oldest);
}

export function resolveAttachmentStoragePath(
  contentHash: string,
  assetsDir = resolveAttachmentAssetsDir(),
  mimeType: string
) {
  return resolveAttachmentStorageKeyPath(assetsDir, buildAttachmentStorageFileName(contentHash, mimeType));
}

function resolveAttachmentAssetsDir() {
  const snapshot = readAttachmentLibraryPathSnapshot();
  if (!snapshot) throw new Error('attachment library path snapshot is unavailable');
  return snapshot.assetsDir;
}

export function resolveAttachmentFile(
  description: Pick<AttachmentResourceDescription, 'contentHash' | 'libraryScope' | 'mimeType' | 'storageKey'>,
  assetsDir?: string
): ResolvedAttachmentFile {
  const snapshot = readAttachmentLibraryPathSnapshot();
  if (!assetsDir && (!snapshot || snapshot.libraryScope !== description.libraryScope)) return { status: 'not_found' };
  const resolvedAssetsDir = assetsDir ?? snapshot!.assetsDir;
  const parsed = parseCanonicalAttachmentStorageKey(description.storageKey);
  if (!parsed || parsed.contentHash !== description.contentHash || parsed.mimeType !== description.mimeType) {
    return { status: 'not_found' };
  }
  const canonicalPath = resolveAttachmentStorageKeyPath(resolvedAssetsDir, description.storageKey);
  let bytes: Buffer;
  try {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const descriptor = fs.openSync(canonicalPath, flags);
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) return { status: 'missing_file', mimeType: description.mimeType };
      bytes = fs.readFileSync(descriptor);
      const identity = `${description.libraryScope}:${description.storageKey}:${description.contentHash}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
      if (!verifiedFileIdentities.has(identity)) {
        if (createHash('sha256').update(bytes).digest('hex') !== description.contentHash) {
          return { status: 'missing_file', mimeType: description.mimeType };
        }
        rememberVerifiedIdentity(identity);
      }
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    console.warn('[native] attachment resource file missing', {
      area: 'native',
      action: 'resolve_attachment_resource',
      storage_key: description.storageKey,
      expected_path: canonicalPath,
      fallback: 'return_missing_file'
    });
    return { status: 'missing_file', mimeType: description.mimeType };
  }
  return {
    bytes,
    status: 'ready',
    filePath: canonicalPath,
    mimeType: description.mimeType
  };
}

export function resetAttachmentFileVerificationCacheForTest() {
  verifiedFileIdentities.clear();
}

export function resolveAttachmentResource(
  description: AttachmentResourceDescription,
  assetsDir?: string
): NativeAttachmentResourceResolution {
  const resolved = resolveAttachmentFile(description, assetsDir);
  if (resolved.status === 'not_found') {
    return {
      status: 'not_found',
      resource_url: null
    };
  }
  if (resolved.status === 'missing_file') {
    return {
      status: 'missing_file',
      mime_type: resolved.mimeType,
      resource_url: null
    };
  }
  return {
    status: 'ready',
    mime_type: resolved.mimeType,
    resource_url: buildAttachmentAssetUrl(description)
  };
}
