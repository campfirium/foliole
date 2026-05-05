import path from 'node:path';

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { openDatabaseConnection } from '../database/connection.js';

const DEFAULT_IMPORTED_AT = '1970-01-01T00:00:00.000Z';

interface ReadwiseBookSourceLookup {
  epubPath: string | null;
  fullDocumentMarkdownPath: string | null;
  highlightMarkdownPath: string | null;
  sourceName: string;
}

function stripExtension(sourceName: string) {
  return sourceName.replace(/\.[^.]+$/u, '');
}

function buildReadwiseBookSourceIdentity(sourceName: string) {
  return `readwise/books/${sourceName.replace(/\\/g, '/')}`;
}

function resolveTrackedSourceName(bucket: ReadwiseBookSourceLookup) {
  if (bucket.fullDocumentMarkdownPath || bucket.highlightMarkdownPath || bucket.epubPath) {
    return `${stripExtension(bucket.sourceName)}.md`;
  }
  return null;
}

export function resolveGeneratedNodeId(bucket: ReadwiseBookSourceLookup) {
  const trackedSourceName = resolveTrackedSourceName(bucket);
  if (!trackedSourceName) {
    return null;
  }

  const trackedFingerprint = createPreparedDesktopTextImport({
    content: '',
    fileName: path.basename(trackedSourceName),
    filePath: bucket.fullDocumentMarkdownPath ?? bucket.highlightMarkdownPath ?? bucket.epubPath ?? trackedSourceName,
    importedAt: DEFAULT_IMPORTED_AT,
    kind: 'markdown',
    sourceIdentity: buildReadwiseBookSourceIdentity(trackedSourceName)
  }).sourceFingerprint;
  const connection = openDatabaseConnection();
  const trackedRow = connection.sqlite
    .prepare(
      `SELECT source.latest_node_id
       FROM import_sources source
       JOIN nodes node ON node.id = source.latest_node_id
       WHERE source.source_fingerprint = ?
         AND source.latest_node_id IS NOT NULL
         AND node.deleted_at IS NULL`
    )
    .get(trackedFingerprint) as { latest_node_id: string } | undefined;
  if (trackedRow?.latest_node_id) {
    return trackedRow.latest_node_id;
  }

  const fallbackLocators = [bucket.fullDocumentMarkdownPath, bucket.highlightMarkdownPath].filter(
    (value): value is string => Boolean(value)
  );
  if (fallbackLocators.length === 0) {
    return null;
  }

  const placeholder = fallbackLocators.map(() => '?').join(', ');
  const fallbackRow = connection.sqlite
    .prepare(
      `SELECT source.latest_node_id
       FROM import_sources source
       JOIN nodes node ON node.id = source.latest_node_id
       WHERE source.latest_node_id IS NOT NULL
         AND source.source_locator IN (${placeholder})
         AND node.deleted_at IS NULL
       ORDER BY source.last_imported_at DESC
       LIMIT 1`
    )
    .get(...fallbackLocators) as { latest_node_id: string } | undefined;
  return fallbackRow?.latest_node_id ?? null;
}

export function resolveImportStatus(bucket: Pick<ReadwiseBookSourceLookup, 'epubPath'>) {
  if (!bucket.epubPath) {
    return 'pending' as const;
  }

  const connection = openDatabaseConnection();
  const importedRow = connection.sqlite
    .prepare(
      `SELECT node_id
       FROM import_runs
       WHERE source_kind = 'epub'
         AND source_locator = ?
         AND node_id IS NOT NULL
         AND result_status IN ('imported', 'degraded')
       ORDER BY imported_at DESC
       LIMIT 1`
    )
    .get(bucket.epubPath) as { node_id: string } | undefined;
  return importedRow?.node_id ? 'completed' : 'pending';
}
