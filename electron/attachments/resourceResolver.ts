import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeAttachmentResourceResolution } from '../../lib/platform/nativeUtilityContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { resolveAppPaths } from '../ipc/paths.js';

const ATTACHMENTS_DIRECTORY_NAME = 'attachments';

interface AttachmentLookupRow extends DatabaseRow {
  hash: string;
  mime_type: string | null;
}

function buildAttachmentResourceUrl(resolvedPath: string) {
  return pathToFileURL(resolvedPath).toString();
}

export function resolveAttachmentStoragePath(hash: string, appDataDir = resolveAppPaths().app_data_dir) {
  return path.join(appDataDir, ATTACHMENTS_DIRECTORY_NAME, hash);
}

export function resolveAttachmentResource(
  attachmentId: string,
  appDataDir = resolveAppPaths().app_data_dir
): NativeAttachmentResourceResolution {
  const normalizedAttachmentId = attachmentId.trim();
  if (!normalizedAttachmentId) {
    return {
      status: 'not_found',
      resource_url: null
    };
  }

  const row = openDatabaseConnection().driver.queryOne<AttachmentLookupRow>(
    `SELECT hash, mime_type
     FROM attachments
     WHERE id = ?`,
    [normalizedAttachmentId]
  );

  if (!row) {
    return {
      status: 'not_found',
      resource_url: null
    };
  }

  const resolvedPath = resolveAttachmentStoragePath(row.hash, appDataDir);
  if (!fs.existsSync(resolvedPath)) {
    console.warn('[native] attachment resource file missing', {
      area: 'native',
      action: 'resolve_attachment_resource',
      attachment_id: normalizedAttachmentId,
      hash: row.hash,
      expected_path: resolvedPath,
      fallback: 'return_missing_file'
    });
    return {
      status: 'missing_file',
      mime_type: row.mime_type,
      resource_url: null
    };
  }

  return {
    status: 'ready',
    mime_type: row.mime_type,
    resource_url: buildAttachmentResourceUrl(resolvedPath)
  };
}
