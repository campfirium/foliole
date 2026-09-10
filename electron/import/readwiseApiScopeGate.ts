import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

export type ReadwiseApiScopePurpose = 'api' | 'cutover';

export function assertReadwiseApiScopeAllowed(purpose: ReadwiseApiScopePurpose) {
  const cutover = loadReadwiseSourceCutover();
  if (purpose === 'cutover') {
    if (cutover?.status !== 'migration-in-progress') {
      throw new Error('readwise_source_migration_not_active');
    }
    return;
  }
  if (cutover && cutover.status !== 'api') {
    throw new Error('readwise_api_scope_blocked_by_migration');
  }
}
