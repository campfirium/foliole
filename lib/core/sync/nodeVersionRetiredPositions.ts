import { LOCAL_NODE_POSITION_SQL } from './nodeVersionMemberPositionRead.js';

/** Resolve exit claims only after every active member's complete position set proves absorption. */
export const RETIRE_RESOLVED_NODE_POSITIONS_SQL = `WITH RECURSIVE
  requested(object_id) AS (VALUES (?)),
  local AS (SELECT group_id, local_device_identity_key FROM sync_group_local_state
    WHERE singleton_id = 1 AND state = 'active'),
  live_members AS (SELECT device.device_identity_key FROM sync_group_devices device
    JOIN local ON local.group_id = device.group_id WHERE device.state = 'active'),
  local_positions AS (${LOCAL_NODE_POSITION_SQL.replaceAll('?', '(SELECT object_id FROM requested)')}),
  live_positions(device_id, version_id) AS (
    SELECT position.device_identity_key, position.adopted_version_id
      FROM node_version_member_positions position JOIN local ON local.group_id = position.group_id
      JOIN live_members member ON member.device_identity_key = position.device_identity_key
      WHERE position.object_id = (SELECT object_id FROM requested)
        AND position.device_identity_key <> local.local_device_identity_key
    UNION SELECT position.device_identity_key, pending.value
      FROM node_version_member_positions position JOIN local ON local.group_id = position.group_id
      JOIN live_members member ON member.device_identity_key = position.device_identity_key
      JOIN json_each(position.pending_version_ids_json) pending
      WHERE position.object_id = (SELECT object_id FROM requested)
        AND position.device_identity_key <> local.local_device_identity_key
    UNION SELECT local.local_device_identity_key, position.version_id
      FROM local_positions position CROSS JOIN local
  ), paths(device_id, start_id, ancestor_id) AS (
    SELECT device_id, version_id, version_id FROM live_positions
    UNION SELECT path.device_id, path.start_id, edge.parent_version_id
      FROM paths path JOIN node_sync_version_parents edge ON edge.version_id = path.ancestor_id
    UNION SELECT path.device_id, path.start_id, version.parent_version_id
      FROM paths path JOIN node_sync_versions version ON version.version_id = path.ancestor_id
      WHERE version.parent_version_id IS NOT NULL
  ), retired_positions(fact_id, version_id) AS (
    SELECT fact_id, adopted_version_id FROM node_version_member_positions
      WHERE object_id = (SELECT object_id FROM requested)
    UNION SELECT position.fact_id, pending.value FROM node_version_member_positions position
      JOIN json_each(position.pending_version_ids_json) pending
      WHERE position.object_id = (SELECT object_id FROM requested)
  ) UPDATE node_version_member_positions AS position SET resolved_revision = proof_revision
    WHERE object_id = (SELECT object_id FROM requested) AND resolved_revision IS NULL
      AND EXISTS (SELECT 1 FROM sync_group_devices device JOIN local ON local.group_id = device.group_id
        WHERE device.device_identity_key = position.device_identity_key AND device.state <> 'active')
      AND NOT EXISTS (SELECT 1 FROM live_members member WHERE NOT EXISTS
        (SELECT 1 FROM live_positions live WHERE live.device_id = member.device_identity_key))
      AND EXISTS (SELECT 1 FROM local_positions WHERE adopted = 1)
      AND NOT EXISTS (SELECT 1 FROM local_positions WHERE complete <> 1)
      AND EXISTS (SELECT 1 FROM live_positions)
      AND NOT EXISTS (SELECT 1 FROM live_positions live CROSS JOIN retired_positions retired
        WHERE retired.fact_id = position.fact_id AND NOT EXISTS (SELECT 1 FROM paths path
          WHERE path.device_id = live.device_id AND path.start_id = live.version_id
            AND path.ancestor_id = retired.version_id))`;
