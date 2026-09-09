import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { readwiseKeepAdapter } from './readwiseKeepAdapter.js';
import { resolveReadwiseTopicMergeSource } from './readwiseTopicMergeSource.js';

interface BodyRow extends NodeBodyRow { id: string; title: string }

export async function applyPristineReadwiseSourceProjection(
  sourceFingerprint: string,
  document: PreparedReadwiseApiDocument,
  now = new Date().toISOString()
) {
  if (document.category === 'epub') return false;
  const source = await sourceProjection(sourceFingerprint);
  if (!source || source.currentContent !== source.legacyContent) return false;
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    writeNodeBody({
      content: document.body,
      driver: tx,
      nodeId: source.nodeId,
      title: source.title,
      updatedAt: now
    });
    const anchors = tx.queryAll<{ anchor_link: string; id: string }>(
      'SELECT id, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL',
      [source.nodeId]
    );
    for (const anchor of anchors) {
      tx.execute(
        'UPDATE nodes SET anchor_link = ?, image_regions = NULL, updated_at = ? WHERE id = ?',
        [strictAnchor(anchor.anchor_link, document.body), now, anchor.id]
      );
    }
  });
  return true;
}

async function sourceProjection(sourceFingerprint: string) {
  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>(
    'SELECT latest_node_id FROM import_sources WHERE source_fingerprint = ?', [sourceFingerprint]
  );
  if (!source?.latest_node_id) return null;
  const mergeSource = await resolveReadwiseTopicMergeSource(source.latest_node_id);
  if (!mergeSource || mergeSource.readwiseSource.kind === 'books') return null;
  const prepared = await readwiseKeepAdapter.loadPreparedRecord(mergeSource.descriptor, {
    highlightDirectoryPath: mergeSource.readwiseSource.highlightPath,
    highlightPolicy: 'reference_only',
    importedAt: new Date().toISOString(),
    kind: mergeSource.readwiseSource.kind,
    readwiseConfig: loadImportManagerSettings().readwiseReaderConfig
  });
  const row = driver.queryOne<BodyRow>(
    `SELECT n.id, n.title, n.content, n.body_blob_hash, cbd.data body_blob_data FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ? AND n.deleted_at IS NULL`,
    [source.latest_node_id]
  );
  return row ? {
    currentContent: requireResolvedNodeBody(row, row.id).content,
    legacyContent: prepared.content,
    nodeId: row.id,
    title: row.title
  } : null;
}

function strictAnchor(value: string, content: string) {
  try {
    const parsed = JSON.parse(value) as { locator?: unknown };
    const values = parsed.locator && typeof parsed.locator === 'object' && 'ranges' in parsed.locator
      ? (parsed.locator as { ranges: unknown[] }).ranges : [parsed.locator];
    const remapped = values.map((item) => {
      const originalText = item && typeof item === 'object' ? (item as { originalText?: unknown }).originalText : null;
      if (typeof originalText !== 'string' || !originalText) return null;
      const from = content.indexOf(originalText);
      return from >= 0 && content.indexOf(originalText, from + 1) < 0
        ? { ...(item as object), from, to: from + originalText.length } : null;
    });
    if (remapped.some((item) => !item)) return null;
    parsed.locator = remapped.length === 1 ? remapped[0] : { ranges: remapped };
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}
