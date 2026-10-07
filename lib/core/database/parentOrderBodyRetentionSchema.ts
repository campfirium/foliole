import { NODE_VERSION_MEMBER_POSITION_SCHEMA } from './nodeVersionMemberPositionSchema.js';

/** Storage adapter for the existing member adoption declaration model. */
export const PARENT_ORDER_BODY_RETENTION_SCHEMA = NODE_VERSION_MEMBER_POSITION_SCHEMA.map((sql) =>
  sql.replaceAll('node_version_member_positions', 'parent_order_member_positions'));
