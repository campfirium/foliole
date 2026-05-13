import fs from 'node:fs';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeAttachmentResourceResolution } from '../../lib/platform/nativeUtilityContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { buildAttachmentAssetUrl } from './attachmentAssetUrl.js';
import { resolveAttachmentStoragePathCandidates } from './storagePath.js';

interface AttachmentLookupRow extends DatabaseRow {
  original_name: string | null;
  mime_type: string | null;
}

export type ResolvedAttachmentFile =
  | {
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

function resolveAttachmentLookup(attachmentId: string) {
  const row = openDatabaseConnection().driver.queryOne<AttachmentLookupRow>(
    `SELECT original_name, mime_type
     FROM attachments
     WHERE id = ?`,
    [attachmentId]
  );
  return row ?? null;
}

export function resolveAttachmentStoragePath(
  attachmentId: string,
  assetsDir = resolveAttachmentAssetsDir(),
  originalName: string | null = null
) {
  const [storagePath] = resolveAttachmentStoragePathCandidates(attachmentId, originalName, assetsDir);
  if (!storagePath) {
    throw new Error('attachment storage path could not be resolved');
  }
  return storagePath;
}

function resolveAttachmentAssetsDir() {
  return resolveRuntimeDataPaths().assetsDir;
}

export function resolveAttachmentFile(
  attachmentId: string,
  assetsDir = resolveAttachmentAssetsDir()
): ResolvedAttachmentFile {
  const normalizedAttachmentId = attachmentId.trim();
  if (!normalizedAttachmentId) {
    return { status: 'not_found' };
  }

  const row = resolveAttachmentLookup(normalizedAttachmentId);
  if (!row) {
    return { status: 'not_found' };
  }

  const [canonicalPath, legacyPath] = resolveAttachmentStoragePathCandidates(
    normalizedAttachmentId,
    row.original_name,
    assetsDir
  );
  if (!canonicalPath) {
    return { status: 'missing_file', mimeType: row.mime_type };
  }
  const fallbackPath = legacyPath ?? canonicalPath;
  if (!fs.existsSync(canonicalPath) && !fs.existsSync(fallbackPath)) {
    console.warn('[native] attachment resource file missing', {
      area: 'native',
      action: 'resolve_attachment_resource',
      attachment_id: normalizedAttachmentId,
      expected_path: canonicalPath,
      fallback: 'return_missing_file'
    });
    return { status: 'missing_file', mimeType: row.mime_type };
  }

  return {
    status: 'ready',
    filePath: fs.existsSync(canonicalPath) ? canonicalPath : fallbackPath,
    mimeType: row.mime_type
  };
}

export function resolveAttachmentResource(
  attachmentId: string,
  assetsDir = resolveAttachmentAssetsDir()
): NativeAttachmentResourceResolution {
  const resolved = resolveAttachmentFile(attachmentId, assetsDir);
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
    resource_url: buildAttachmentAssetUrl(attachmentId)
  };
}
