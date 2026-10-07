import { buildNodeBodyContentSql } from './nodeBodyResolution.js';
import type { WorkspaceSnapshotLoadOptions } from './workspaceSnapshot.js';

export function buildBodySelection(options: WorkspaceSnapshotLoadOptions) {
  if (options.includeBody) {
    return {
      bodyJoin: 'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash',
      bodyStatusExpression: `CASE
         WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL AND cb.availability IN ('fetching', 'failed') THEN cb.availability
         WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL THEN 'missing'
         WHEN TRIM(${buildNodeBodyContentSql()}) = '' THEN 'empty'
         ELSE 'ready'
       END`,
      contentExpression: buildNodeBodyContentSql()
    };
  }
  return {
    bodyJoin: '',
    bodyStatusExpression: `CASE
         WHEN n.body_blob_hash IS NOT NULL AND cb.availability IN ('fetching', 'failed') THEN cb.availability
         WHEN n.body_blob_hash IS NOT NULL AND (cb.hash IS NULL OR cb.availability = 'missing') THEN 'missing'
         WHEN n.body_blob_hash IS NOT NULL THEN 'ready'
         WHEN TRIM(n.content) = '' THEN 'empty'
         ELSE 'ready'
       END`,
    contentExpression: "''"
  };
}
