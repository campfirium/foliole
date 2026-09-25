import type { DbPort } from './dbPort.js';

export async function restoreMissingNodeOrderFromCurrentVersions(port: DbPort) {
  await port.run(`
    INSERT INTO main.node_order (node_id, position)
    SELECT n.id, json_extract(v.snapshot_json, '$.position')
    FROM main.nodes n
    JOIN main.node_sync_versions v ON v.version_id = n.current_version_id
    LEFT JOIN main.node_order o ON o.node_id = n.id
    WHERE o.node_id IS NULL
      AND CASE WHEN json_valid(v.snapshot_json)
        THEN json_type(v.snapshot_json, '$.position') = 'integer'
          AND json_extract(v.snapshot_json, '$.position') >= 0
        ELSE 0 END
    ON CONFLICT(node_id) DO NOTHING
  `);
}

export async function restoreMissingIncomingNodeOrder(port: DbPort, incomingAlias = 'inc') {
  const alias = `"${incomingAlias.replaceAll('"', '""')}"`;
  await port.run(`
    INSERT INTO main.node_order (node_id, position)
    SELECT incoming.node_id, incoming.position
    FROM ${alias}.node_order incoming
    JOIN ${alias}.nodes source ON source.id = incoming.node_id
    JOIN main.nodes local ON local.id = incoming.node_id
      AND local.current_version_id = source.current_version_id
    LEFT JOIN main.node_order existing ON existing.node_id = incoming.node_id
    WHERE existing.node_id IS NULL
    ON CONFLICT(node_id) DO NOTHING
  `);
}
