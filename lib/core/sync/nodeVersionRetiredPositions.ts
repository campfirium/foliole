import { LOCAL_NODE_POSITION_SQL } from './nodeVersionMemberPositionRead.js';
import { versionRetiredPositionsSql } from './versionRetiredPositionsSql.js';

export const RETIRE_RESOLVED_NODE_POSITIONS_SQL = versionRetiredPositionsSql(
  'node_version_member_positions', LOCAL_NODE_POSITION_SQL,
  `SELECT version_id, parent_version_id FROM node_sync_version_parents
    UNION SELECT version_id, parent_version_id FROM node_sync_versions WHERE parent_version_id IS NOT NULL`
);
