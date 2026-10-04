import type { SyncIdentityPackPage } from './syncIdentityPackPage.js';

export const IDENTITY_FACT_SCOPE_SQL = `group_id = ? AND source_peer_id = ?
  AND source_view_id = ? AND node_id = ? AND fact_digest = ?`;

export function identityFactScope(page: SyncIdentityPackPage) {
  if (!page.facts || !page.objects[0]) throw new Error('sync_identity_fact_request_invalid');
  return [page.group_id, page.source_peer_id, page.source_view_id,
    page.objects[0].object_id, page.facts.digest];
}
