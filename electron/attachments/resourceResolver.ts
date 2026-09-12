import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { classifyAttachmentBytes } from '../../lib/platform/attachmentByteClassification.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
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

export function resolveAttachmentFile(storageKey: string, assetsDir?: string): ResolvedAttachmentFile {
  const snapshot = readAttachmentLibraryPathSnapshot();
  if (!assetsDir && !snapshot) return { status: 'not_found' };
  const resolvedAssetsDir = assetsDir ?? snapshot!.assetsDir;
  const parsed = parseCanonicalAttachmentStorageKey(storageKey);
  if (!parsed) return { status: 'not_found' };
  const canonicalPath = resolveAttachmentStorageKeyPath(resolvedAssetsDir, storageKey);
  let bytes: Buffer;
  try {
    const linkStat = fs.lstatSync(canonicalPath);
    if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
      return { status: 'missing_file', mimeType: parsed.mimeType };
    }
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const descriptor = fs.openSync(canonicalPath, flags);
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) return { status: 'missing_file', mimeType: parsed.mimeType };
      bytes = fs.readFileSync(descriptor);
      if (createHash('sha256').update(bytes).digest('hex') !== parsed.contentHash ||
          classifyAttachmentBytes(bytes) !== parsed.mimeType) {
        return { status: 'missing_file', mimeType: parsed.mimeType };
      }
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    console.warn('[native] attachment resource file missing', {
      area: 'native',
      action: 'resolve_attachment_resource',
      storage_key: storageKey,
      expected_path: canonicalPath,
      fallback: 'return_missing_file'
    });
    return { status: 'missing_file', mimeType: parsed.mimeType };
  }
  return {
    bytes,
    status: 'ready',
    filePath: canonicalPath,
    mimeType: parsed.mimeType
  };
}

export function resolveAttachmentResource(storageKey: string, assetsDir?: string): NativeAttachmentResourceResolution {
  const resolved = resolveAttachmentFile(storageKey, assetsDir);
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
    resource_url: buildAttachmentAssetUrl(storageKey)
  };
}
