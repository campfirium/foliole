import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { openDatabaseConnection } from '../database/connection.js';

import {
  loadRemoteImageLearnedSource,
  normalizeRemoteImageSourceOrigin
} from './remoteImageLearnedSources.js';

export interface RemoteImageSourceContext {
  imageHost: string | null;
  learnedSourceOrigin: string | null;
  source: 'learned' | 'node' | 'none';
  sourceOrigin: string | null;
}

function extractFrontmatterUrl(content: string | null | undefined) {
  const lines = (content ?? '').replace(/\r\n?/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') {
    return null;
  }
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '---') {
      return null;
    }
    const match = /^(?:url|source_url|link):\s*(.+?)\s*$/.exec(line.trim());
    if (match?.[1]) {
      return match[1].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return null;
}

interface SourceNodeRow extends DatabaseRow {
  anchor_link: string | null;
  id: string;
  parent_id: string | null;
}

interface SourceLocatorRow extends DatabaseRow {
  source_locator: string;
}

function readSourceNodeId(driver: DatabaseDriver, nodeId: string) {
  const node = driver.queryOne<SourceNodeRow>(
    'SELECT id, parent_id, anchor_link FROM nodes WHERE id = ?',
    [nodeId]
  );
  return node?.anchor_link && node.parent_id ? node.parent_id : node?.id ?? null;
}

function readImportSourceOrigin(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<SourceLocatorRow>(
    `SELECT source_locator FROM import_sources
     WHERE latest_node_id = ?
     ORDER BY CASE WHEN lower(source_kind) = 'pdf' THEN 0 ELSE 1 END, last_imported_at DESC
     LIMIT 1`,
    [nodeId]
  );
  return normalizeRemoteImageSourceOrigin(row?.source_locator);
}

function readImportRunOrigin(driver: DatabaseDriver, nodeId: string) {
  const rows = driver.queryAll<SourceLocatorRow>(
    `SELECT source_locator FROM import_runs
     WHERE node_id = ? ORDER BY imported_at DESC LIMIT 6`,
    [nodeId]
  );
  return rows.map((row) => normalizeRemoteImageSourceOrigin(row.source_locator)).find(Boolean) ?? null;
}

function readFrontmatterOrigin(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<NodeBodyRow>(
    `SELECT n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`,
    [nodeId]
  );
  if (!row) return null;
  const body = resolveNodeBody(row);
  return body.status === 'resolved'
    ? normalizeRemoteImageSourceOrigin(extractFrontmatterUrl(body.content))
    : null;
}

export function resolveRemoteImageSourceOriginWithDriver(driver: DatabaseDriver, nodeId: string) {
  const sourceNodeId = readSourceNodeId(driver, nodeId);
  if (!sourceNodeId) return null;
  return readImportSourceOrigin(driver, sourceNodeId)
    ?? readImportRunOrigin(driver, sourceNodeId)
    ?? readFrontmatterOrigin(driver, sourceNodeId);
}

export function resolveRemoteImageSourceOriginForNode(nodeId: string | null) {
  const normalizedNodeId = nodeId?.trim() ?? '';
  if (!normalizedNodeId) {
    return null;
  }
  return resolveRemoteImageSourceOriginWithDriver(openDatabaseConnection().driver, normalizedNodeId);
}

export function resolveRemoteImageSourceContext(nodeId: string | null, sourceUrl: string): RemoteImageSourceContext {
  const nodeSourceOrigin = resolveRemoteImageSourceOriginForNode(nodeId);
  const learned = loadRemoteImageLearnedSource(sourceUrl);
  if (nodeSourceOrigin) {
    return {
      imageHost: learned.imageHost,
      learnedSourceOrigin: learned.sourceOrigin,
      source: 'node',
      sourceOrigin: nodeSourceOrigin
    };
  }
  if (learned.sourceOrigin) {
    return {
      imageHost: learned.imageHost,
      learnedSourceOrigin: learned.sourceOrigin,
      source: 'learned',
      sourceOrigin: learned.sourceOrigin
    };
  }
  return {
    imageHost: learned.imageHost,
    learnedSourceOrigin: null,
    source: 'none',
    sourceOrigin: null
  };
}
