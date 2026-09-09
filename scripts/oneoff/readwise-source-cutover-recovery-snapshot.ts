import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';

export function recursiveNodeIds(driver: DatabaseDriver, roots: string[]) {
  return recursiveNodeRows(driver, roots).map((row) => row.id).sort();
}

export function recursiveNodeRows(driver: DatabaseDriver, roots: string[]) {
  if (roots.length === 0) return [];
  return driver.queryAll<{ content: string; id: string; is_title_manual: number }>(
    'WITH RECURSIVE tree(id) AS (SELECT id FROM nodes WHERE id IN (' + marks(roots) +
      ') AND deleted_at IS NULL UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id=t.id ' +
      'WHERE n.deleted_at IS NULL) SELECT n.id, n.content, n.is_title_manual FROM nodes n ' +
      'JOIN tree t ON t.id=n.id ORDER BY n.id',
    roots
  );
}

export function hashNodeRows(driver: DatabaseDriver, nodeIds: string[]) {
  if (nodeIds.length === 0) return hashRecoveryValue([]);
  const rows = driver.queryAll<Record<string, unknown>>(
    'SELECT n.*, o.position FROM nodes n LEFT JOIN node_order o ON o.node_id=n.id ' +
      'WHERE n.id IN (' + marks(nodeIds) + ') ORDER BY n.id',
    nodeIds
  );
  return hashRecoveryValue(rows);
}

export function hashImportSources(driver: DatabaseDriver, sourceFingerprints: string[]) {
  const rows = driver.queryAll<Record<string, unknown>>(
    'SELECT * FROM import_sources WHERE source_fingerprint IN (' + marks(sourceFingerprints) +
      ') ORDER BY source_fingerprint',
    sourceFingerprints
  );
  return hashRecoveryValue(rows);
}

export function hashUnrelatedNodes(driver: DatabaseDriver, excluded: string[]) {
  const rows = driver.queryAll<Record<string, unknown>>(
    'SELECT id, parent_id, kind, title, content, body_blob_hash, created_at, updated_at, deleted_at ' +
      'FROM nodes WHERE id NOT IN (' + marks(excluded) + ') ORDER BY id',
    excluded
  );
  return hashRecoveryValue(rows);
}

export async function hashAttachmentFiles(libraryHome: string, attachmentIds: string[]) {
  const assetNames = await fs.readdir(path.join(libraryHome, 'Assets'));
  const rows: Array<{ hash: string; name: string }> = [];
  for (const id of attachmentIds) {
    for (const name of assetNames.filter((item) => item === id || item.startsWith(id + '.')).sort()) {
      rows.push({
        hash: hashRecoveryValue(await fs.readFile(path.join(libraryHome, 'Assets', name))),
        name
      });
    }
  }
  return hashRecoveryValue(rows);
}

export function marks(values: unknown[]) {
  if (values.length === 0) throw new Error('readwise_recovery_empty_sql_set');
  return values.map(() => '?').join(',');
}

export function hashRecoveryValue(value: unknown) {
  const bytes = value instanceof Uint8Array ? value : JSON.stringify(value);
  return createHash('sha256').update(bytes).digest('hex');
}
