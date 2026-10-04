import type { DbPort } from './dbPort.js';
import { assembleSyncIdentityStagedFacts, clearSyncIdentityStagedFacts } from './syncIdentityFactAssembly.js';
import { buildSyncIdentityPackPage, type SyncIdentityPackPage } from './syncIdentityPackPage.js';

type Dependency = SyncIdentityPackPage['objects'][number];

/** Reuse sealed ancestor facts in the same authenticated fixed view and apply transaction. */
export async function assembleSyncIdentityDependencyFacts(port: DbPort, page: SyncIdentityPackPage,
  dependencies: readonly Dependency[]) {
  const assembled: SyncIdentityPackPage[] = [];
  if (page.facts?.section !== 'head') return assembled;
  for (const dependency of dependencies) {
    const rows = await port.query<{ fact_digest: string }>(`SELECT DISTINCT fact_digest
      FROM sync_identity_fact_sections WHERE group_id = ? AND source_peer_id = ?
        AND source_view_id = ? AND node_id = ?`,
    [page.group_id, page.source_peer_id, page.source_view_id, dependency.object_id]);
    if (rows.length === 0) continue;
    if (rows.length !== 1) throw new Error('sync_identity_fact_dependency_ambiguous');
    const parent = buildSyncIdentityPackPage({ ...page, objects: [dependency],
      facts: { section: 'head', after: null, limit: 64, digest: rows[0]!.fact_digest } });
    await assembleSyncIdentityStagedFacts(port, parent);
    assembled.push(parent);
  }
  return assembled;
}

export async function clearSyncIdentityDependencyFacts(port: DbPort,
  pages: readonly SyncIdentityPackPage[]) {
  for (const page of pages) await clearSyncIdentityStagedFacts(port, page);
}
