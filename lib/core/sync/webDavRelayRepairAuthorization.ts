import type { DbPort } from './dbPort.js';
import { loadNodeOwnedArticleResourceNeeds } from './nodeOwnedArticleResourceNeeds.js';
import type { RepairDemand } from './webDavRelayRepairWire.js';

export async function resolveWebDavRelayRepairKeys(db: DbPort, demand: RepairDemand) {
  const ids = [...new Set(demand.map(([, id]) => id))];
  const nodes = await db.query<{ id: string }>(`SELECT n.id FROM nodes n
    JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id
    WHERE n.id IN (SELECT value FROM json_each(?)) AND n.deleted_at IS NULL
      AND s.deleted_at IS NULL AND s.current_version_id IS NOT NULL`, [JSON.stringify(ids)]);
  const authorized = new Set<string>();
  for (const { id } of nodes) {
    const hashes = new Set(demand.filter(([, owner]) => owner === id).map(([hash]) => hash));
    const { needs } = await loadNodeOwnedArticleResourceNeeds(db, [id]);
    for (const need of needs) if (hashes.has(need.contentHash)) authorized.add(need.storageKey);
  }
  return [...authorized];
}
