import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import type { NodeResourceReference } from './nodeResourceReferences.js';

export const CURRENT_RESOURCE_BODY_ROWS_SQL = `SELECT n.id,
  CASE WHEN n.body_blob_hash IS NOT NULL AND n.body_blob_hash <> '' THEN
    CASE WHEN cb.compression = 'none' THEN CAST(cbd.data AS TEXT) END ELSE n.content END AS content
  FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
  LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash`;
export const CURRENT_RESOURCE_NAME_ROWS_SQL = 'SELECT id, original_name FROM attachments';

/** Current parsed image owners retain known names even when legacy links are absent. */
export function addCurrentBodyResourceNames(
  byNode: Map<string, NodeResourceReference[]>,
  bodies: Array<{ id: string; content: string | null }>,
  names: Array<{ id: string; original_name: string | null }>
) {
  const originalNames = new Map(names.map((row) => [row.id, row.original_name]));
  for (const node of bodies) {
    if (!node.content) continue;
    const references = byNode.get(node.id) ?? [];
    for (const key of collectArticleImageStorageKeys(node.content)) {
      const id = key.slice(0, 64);
      if (!originalNames.has(id) || references.some((item) => item.storage_key === key && item.role === 'image')) continue;
      references.push({ storage_key: key, role: 'image', original_name: originalNames.get(id)! });
    }
    if (references.length) byNode.set(node.id, references);
  }
}
