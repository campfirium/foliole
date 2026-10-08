import { buildNodeBodyContentSql } from './nodeBodyResolution.js';
import type { WorkspaceSnapshotLoadOptions } from './workspaceSnapshot.js';

export function buildBodySelection(options: WorkspaceSnapshotLoadOptions) {
  if (options.includeBody) {
    return {
      bodyJoin: '',
      bodyStatusExpression: `CASE
         WHEN TRIM(${buildNodeBodyContentSql()}) = '' THEN 'empty'
         ELSE 'ready'
       END`,
      contentExpression: buildNodeBodyContentSql()
    };
  }
  return {
    bodyJoin: '',
    bodyStatusExpression: `CASE
         WHEN TRIM(n.content) = '' THEN 'empty'
         ELSE 'ready'
       END`,
    contentExpression: "''"
  };
}
