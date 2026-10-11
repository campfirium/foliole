import { saveLocalCurrentParentOrderWithDbPort } from '../../../../../../lib/core/sync/currentParentOrderStore';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import { iosCompanionHostName } from '../../runtime/iosCompanionMutationState';

export async function rekeyParentChildOrders(port: DbPort, sourceId: string, canonicalId: string) {
  const rows = await port.query<{ parent_id: string; child_ids_json: string }>(
    'SELECT parent_id, child_ids_json FROM parent_child_order'
  );
  const original = new Map(rows.map((row) => [row.parent_id, JSON.parse(row.child_ids_json) as string[]]));
  const next = new Map<string, string[]>();
  for (const [parentId, ids] of original) {
    const destination = parentId === sourceId ? canonicalId : parentId;
    const merged = next.get(destination) ?? [];
    for (const id of ids) {
      if (!merged.includes(id)) merged.push(id);
      if (id === sourceId && !merged.includes(canonicalId)) merged.push(canonicalId);
    }
    next.set(destination, merged);
  }
  const changed = [...next].filter(([id, ids]) => JSON.stringify(ids) !== JSON.stringify(original.get(id)));
  if (changed.length === 0 && !original.has(sourceId)) return;
  const now = new Date().toISOString();
  const hostName = await iosCompanionHostName(port);
  for (const [parentId, childIds] of changed) {
    await saveLocalCurrentParentOrderWithDbPort(port, { parentId, childIds, now, hostName });
  }
}
