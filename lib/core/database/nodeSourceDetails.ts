import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface ImportSourceRow extends DatabaseRow {
  first_imported_at: string;
  last_content_fingerprint: string;
  last_imported_at: string;
  latest_node_id: string | null;
  provider: string;
  source_fingerprint: string;
  source_kind: string;
  source_locator: string;
  source_name: string;
}

interface ImportRunRow extends DatabaseRow {
  content_fingerprint: string;
  degraded_reason: string | null;
  duplicate_semantic: 'duplicate' | 'new' | 'updated';
  failure_reason: string | null;
  id: string;
  imported_at: string;
  node_id: string | null;
  provider: 'desktop_text_file';
  result_status: 'degraded' | 'failed' | 'imported';
  source_fingerprint: string;
  source_kind: 'epub' | 'html' | 'markdown' | 'text';
  source_locator: string;
  source_name: string;
}

interface KeepImportItemRow extends DatabaseRow {
  first_seen_at: string;
  last_imported_at: string | null;
  last_seen_at: string;
  last_status: 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported';
  rule_id: string;
  source_mtime_ms: number;
  source_path: string;
  source_size_bytes: number;
}

interface NodeContextRow extends DatabaseRow {
  anchor_link: string | null;
  id: string;
  parent_id: string | null;
}

export interface NodeSourceDetails {
  importRuns: ImportRunRow[];
  importSource: ImportSourceRow | null;
  inheritedFromParent: boolean;
  keepImportItem: KeepImportItemRow | null;
  sourceNodeId: string;
}

function resolveSourceNodeContext(driver: DatabaseDriver, nodeId: string) {
  const node = driver.queryOne<NodeContextRow>(
    `SELECT id, parent_id, anchor_link
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
  if (!node) {
    return null;
  }
  if (node.anchor_link && node.parent_id) {
    return {
      inheritedFromParent: true,
      sourceNodeId: node.parent_id
    };
  }
  return {
    inheritedFromParent: false,
    sourceNodeId: node.id
  };
}

function readImportSource(driver: DatabaseDriver, nodeId: string) {
  return (
    driver.queryOne<ImportSourceRow>(
      `SELECT
         source_fingerprint,
         provider,
         source_kind,
         source_name,
         source_locator,
         first_imported_at,
         last_imported_at,
         last_content_fingerprint,
         latest_node_id
       FROM import_sources
       WHERE latest_node_id = ?
       LIMIT 1`,
      [nodeId]
    ) ?? null
  );
}

function readImportRuns(driver: DatabaseDriver, nodeId: string, limit: number) {
  return driver.queryAll<ImportRunRow>(
    `SELECT
       id,
       source_fingerprint,
       provider,
       source_kind,
       source_name,
       source_locator,
       content_fingerprint,
       duplicate_semantic,
       result_status,
       node_id,
       imported_at,
       degraded_reason,
       failure_reason
     FROM import_runs
     WHERE node_id = ?
     ORDER BY imported_at DESC
     LIMIT ?`,
    [nodeId, limit]
  );
}

function readKeepImportItem(driver: DatabaseDriver, nodeId: string) {
  return (
    driver.queryOne<KeepImportItemRow>(
      `SELECT
         rule_id,
         source_path,
         source_mtime_ms,
         source_size_bytes,
         last_status,
         first_seen_at,
         last_seen_at,
         last_imported_at
       FROM keep_import_items
       WHERE last_node_id = ?
       ORDER BY
         CASE WHEN last_imported_at IS NULL THEN 1 ELSE 0 END,
         last_imported_at DESC,
         last_seen_at DESC
       LIMIT 1`,
      [nodeId]
    ) ?? null
  );
}

export function loadNodeSourceDetails(driver: DatabaseDriver, nodeId: string, runLimit = 6): NodeSourceDetails | null {
  const context = resolveSourceNodeContext(driver, nodeId);
  if (!context) {
    return null;
  }

  return {
    importRuns: readImportRuns(driver, context.sourceNodeId, runLimit),
    importSource: readImportSource(driver, context.sourceNodeId),
    inheritedFromParent: context.inheritedFromParent,
    keepImportItem: readKeepImportItem(driver, context.sourceNodeId),
    sourceNodeId: context.sourceNodeId
  };
}
