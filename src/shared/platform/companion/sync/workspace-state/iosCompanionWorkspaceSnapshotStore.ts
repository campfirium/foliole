import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from '../../../../../../lib/core/database/androidCompanionNodeResourceQueryDefinitions';
import { ANDROID_COMPANION_WORKSPACE_READ_RULES } from '../../../../../../lib/core/database/androidCompanionWorkspaceReadDefinitions';
import { normalizeWorkspaceSnapshot, resolveWorkspaceSnapshotActiveNodeId } from '../../../../../../lib/core/database/workspaceSnapshotContract';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';

import {
  attachIosWorkspaceNodeAttachments,
  buildIosPersistedNodeViews,
  buildIosWorkspaceNodes
} from './iosCompanionWorkspaceSnapshotRows';

const QUERIES = ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS;
const RULES = ANDROID_COMPANION_WORKSPACE_READ_RULES.snapshot;
const DEVICE_ID_KEY = 'device_id';
const ACTIVE_NODE_KEY = 'active_node_id';

export async function loadIosCompanionWorkspaceSnapshot(connection: DbPort) {
  const deviceId = await loadMetaValue(connection, 'companion_meta', DEVICE_ID_KEY) ?? '*';
  const nodes = await queryRows(connection, await snapshotSql(connection), [deviceId]);
  if (nodes.length === 0) return null;

  const { nodesById, trashedNodeIds } = buildIosWorkspaceNodes(nodes);
  attachIosWorkspaceNodeAttachments(nodesById, await loadAttachments(connection));
  const orderedRows = await queryRows(connection, QUERIES.workspaceOrderedNodeIds.sql);
  const nodeOrder = orderedRows.flatMap((row) => typeof row.id === 'string' ? [row.id] : []);
  const activeNodeId = await loadMetaValue(connection, 'workspace_meta', ACTIVE_NODE_KEY);
  const persistedNodeViewById = deviceId === '*'
    ? {}
    : buildIosPersistedNodeViews(await queryRows(connection, QUERIES.nodeViewStatesByDevice.sql, [deviceId]));
  const nodeOpenStateById = Object.fromEntries(
    (await queryRows(connection, 'SELECT node_id, last_opened_at FROM node_open_state')).flatMap((row) =>
      typeof row.node_id === 'string' && typeof row.last_opened_at === 'string'
        ? [[row.node_id, { lastOpenedAt: row.last_opened_at, nodeId: row.node_id }]]
        : []
    )
  );

  return normalizeWorkspaceSnapshot({
    activeNodeId: resolveWorkspaceSnapshotActiveNodeId({ activeNodeId, nodeOrder, nodesById }),
    nodeOrder,
    ...(Object.keys(nodeOpenStateById).length ? { nodeOpenStateById } : {}),
    nodesById,
    ...(Object.keys(persistedNodeViewById).length ? { persistedNodeViewById } : {}),
    trashedNodeIds,
    untitledSequenceByParent: parseObject(
      await loadMetaValue(connection, 'workspace_meta', RULES.untitledSequenceMetaKey)
    )
  });
}

async function snapshotSql(connection: DbPort) {
  const hasBlobData = await tableExists(connection, 'content_blob_data');
  return QUERIES.workspaceSnapshotNodes.sql
    .replaceAll(RULES.contentExpressionToken, hasBlobData ? RULES.contentExpressionWithBodyBlobSql : RULES.contentExpressionInlineSql)
    .replaceAll(RULES.contentBlobJoinToken, hasBlobData ? RULES.contentBlobJoinSql : '')
    .replaceAll(RULES.bodyStatusExpressionToken, hasBlobData ? RULES.bodyStatusExpressionWithBodyBlobSql : RULES.bodyStatusExpressionInlineSql);
}

async function loadAttachments(connection: DbPort) {
  return queryRows(connection,
    `SELECT na.node_id, na.attachment_id, na.role, a.mime_type, a.original_name
     FROM node_attachments na LEFT JOIN attachments a ON a.id = na.attachment_id
     ORDER BY na.node_id, na.role, na.attachment_id`
  );
}

async function tableExists(connection: DbPort, table: string) {
  const rows = await queryRows(
    connection,
    "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [table]
  );
  return rows.length > 0;
}

async function loadMetaValue(connection: DbPort, table: string, key: string) {
  const rows = await queryRows(connection, `SELECT value FROM ${table} WHERE key = ? LIMIT 1`, [key]);
  const value = rows[0]?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function queryRows(connection: DbPort, statement: string, values: unknown[] = []) {
  return connection.query(statement, values as never[]);
}

function parseObject(value: string | null) {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
