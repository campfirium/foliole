/** A tombstone permits its own retained chain, never an unrelated late live pack. */
export function eligiblePackVersion(table: string, alias: string) {
  return `${table}.object_id NOT IN ('special-inbox', 'special-virtual-root') AND (
    NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones tomb WHERE tomb.node_id = ${table}.object_id)
    OR EXISTS (SELECT 1 FROM ${alias}.node_sync_tombstones incoming_tomb
      JOIN main.node_sync_tombstones local_tomb ON local_tomb.node_id = incoming_tomb.node_id
        AND local_tomb.version_id = incoming_tomb.version_id
      WHERE incoming_tomb.node_id = ${table}.object_id))`;
}
