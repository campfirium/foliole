export type WorkspaceBodyStatus = 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';

export const WORKSPACE_BODY_STATUS_SQL = `CASE
         WHEN n.body_blob_hash IS NOT NULL AND cb.availability IN ('fetching', 'failed') THEN cb.availability
         WHEN n.body_blob_hash IS NOT NULL AND (cb.hash IS NULL OR cb.availability = 'missing') THEN 'missing'
         WHEN n.body_blob_hash IS NOT NULL THEN 'ready'
         WHEN TRIM(n.content) = '' THEN 'empty'
         ELSE 'ready'
       END`;

export function isWorkspaceBodyStatus(value: string | null): value is WorkspaceBodyStatus {
  return value === 'empty' || value === 'failed' || value === 'fetching' || value === 'missing' || value === 'ready';
}
