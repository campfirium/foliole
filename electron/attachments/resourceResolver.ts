import fs from 'node:fs';
import path from 'node:path';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { LIBRARY_ASSETS_DIRNAME } from '../../lib/platform/libraryPaths.js';
import type { NativeAttachmentResourceResolution } from '../../lib/platform/nativeUtilityContract.js';
import { openDatabaseConnection, resolveDatabasePath } from '../database/connection.js';

import { buildAttachmentAssetUrl } from './attachmentAssetUrl.js';

interface AttachmentLookupRow extends DatabaseRow {
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
    `SELECT mime_type
     FROM attachments
     WHERE id = ?`,
    [attachmentId]
  );
  return row ?? null;
}

export function resolveAttachmentStoragePath(attachmentId: string, assetsDir = resolveAttachmentAssetsDir()) {
  return path.join(assetsDir, attachmentId);
}

function resolveAttachmentAssetsDir() {
  const activeDatabasePath = resolveDatabasePath();
  const libraryHome = path.dirname(path.dirname(activeDatabasePath));
  return path.join(libraryHome, LIBRARY_ASSETS_DIRNAME);
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

  const resolvedPath = resolveAttachmentStoragePath(normalizedAttachmentId, assetsDir);
  if (!fs.existsSync(resolvedPath)) {
    console.warn('[native] attachment resource file missing', {
      area: 'native',
      action: 'resolve_attachment_resource',
      attachment_id: normalizedAttachmentId,
      expected_path: resolvedPath,
      fallback: 'return_missing_file'
    });
    return { status: 'missing_file', mimeType: row.mime_type };
  }

  return {
    status: 'ready',
    filePath: resolvedPath,
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
