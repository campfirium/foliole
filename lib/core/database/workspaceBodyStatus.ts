export type WorkspaceBodyStatus = 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';

export const WORKSPACE_BODY_STATUS_SQL = `CASE
         WHEN TRIM(n.content) = '' THEN 'empty'
         ELSE 'ready'
       END`;

export function isWorkspaceBodyStatus(value: string | null): value is WorkspaceBodyStatus {
  return value === 'empty' || value === 'failed' || value === 'fetching' || value === 'missing' || value === 'ready';
}
