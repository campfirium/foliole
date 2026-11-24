import { bodyPartPrefix } from './bodyPartitionIdentity.js';
import type { DatabaseDriver } from './driver.js';
import { loadNodeBodyResolution, NodeBodyUnavailableError } from './nodeBodyResolution.js';

interface BodyPartRow {
  [column: string]: unknown;
  id: string;
  parent_id: string | null;
  deleted_at: string | null;
  title: string | null;
}

export function readBodyPartSlots(driver: DatabaseDriver, nodeId: string) {
  const prefix = bodyPartPrefix(nodeId);
  const upperBound = `${prefix}:`;
  const rows = driver.queryAll<BodyPartRow>(`
    SELECT id, parent_id, deleted_at, title FROM nodes WHERE id >= ? AND id < ?
    UNION ALL
    SELECT node_id, NULL, deleted_at, NULL FROM node_sync_tombstones
      WHERE node_id >= ? AND node_id < ?
    ORDER BY id DESC`, [prefix, upperBound, prefix, upperBound]);
  const slots = new Map<string, BodyPartRow>();
  for (const row of rows) {
    const suffix = row.id.slice(prefix.length);
    if (!/^\d{12}(?:-\d{12})?$/.test(suffix)) continue;
    const slot = row.id.slice(0, prefix.length + 12);
    // A restored earlier topic is independent once a replacement exists for its slot.
    if (!slots.has(slot)) slots.set(slot, row);
  }
  return slots;
}

export function readBodyPartIds(driver: DatabaseDriver, nodeId: string) {
  return [...readBodyPartSlots(driver, nodeId).values()]
    .filter(part => part.parent_id === nodeId && part.deleted_at === null)
    .map(part => part.id).reverse();
}

export function readPartitionedNodeBody(driver: DatabaseDriver, nodeId: string): string {
  const body = loadNodeBodyResolution(driver, nodeId);
  if (!body) throw new NodeBodyUnavailableError([nodeId]);
  return body.content + readBodyPartIds(driver, nodeId).map(id => readPartitionedNodeBody(driver, id)).join('');
}
