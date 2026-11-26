import {
  androidReadableArticleColumns,
  androidReadableArticleReferencePdfAttachmentSql,
  androidReadableArticleSql,
  androidSearchExcerptExpression,
} from './androidCompanionDerivedReadSql.js';
import { COMPANION_WORKSPACE_DISPLAY_NODE_QUERY } from './companionSnapshotNodeQuery.js';
import { COMPANION_TOPIC_SEARCH_QUERY } from './companionTopicSearchDefinitions.js';
import { NODE_RESOURCES_SQL } from './nodeResourcesSql.js';
import { VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

// A matching page counts when an active Topic still holds its PDF; the local owner index
// answers that per matching attachment, so a search never walks every node.
const LIVE_PDF_OWNER_SQL = `EXISTS (SELECT 1 FROM pdf_attachment_nodes mount
  INNER JOIN nodes owner ON owner.id = mount.node_id
  WHERE mount.storage_key = pdf_page_text.attachment_id || '.pdf' AND owner.deleted_at IS NULL)`;

export const ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS = {
  nodeAttachments: {
    resultKey: 'attachments',
    sql: `SELECT * FROM (${NODE_RESOURCES_SQL}) WHERE node_id = ? ORDER BY role, attachment_id`,
    columns: [
      { key: 'attachmentId', source: 'attachment_id', type: 'string' },
      { key: 'role', source: 'role', type: 'string' },
      { key: 'mimeType', source: 'mime_type', type: 'nullableString' },
      { key: 'originalName', source: 'original_name', type: 'nullableString' },
      { key: 'contentHash', source: 'content_hash', type: 'nullableString' },
      { key: 'storageKey', source: 'storage_key', type: 'nullableString' },
      { key: 'availability', source: 'availability', type: 'nullableString' }
    ]
  },
  pdfPageTextPages: {
    resultKey: 'pages',
    sql:
      'SELECT page, text, page_width, page_height FROM pdf_page_text ' +
      'WHERE attachment_id = ? ORDER BY page ASC',
    columns: [
      { key: 'page', source: 'page', type: 'long' },
      { key: 'text', source: 'text', type: 'string' },
      { key: 'page_width', source: 'page_width', type: 'double' },
      { key: 'page_height', source: 'page_height', type: 'double' }
    ]
  },
  pdfPageTextSearch: {
    resultKey: 'results',
    sql:
      'SELECT attachment_id, page, text, page_width, page_height, ' +
      'max(0, instr(lower(text), ?) - 1) AS match_start, ' +
      `${androidSearchExcerptExpression('text', '?', 80)} AS excerpt ` +
      'FROM pdf_page_text WHERE instr(lower(text), ?) > 0 ' +
      `AND ${LIVE_PDF_OWNER_SQL} ` +
      'ORDER BY attachment_id ASC, page ASC LIMIT ?',
    columns: [
      { key: 'attachment_id', source: 'attachment_id', type: 'string' },
      { key: 'page', source: 'page', type: 'long' },
      { key: 'text', source: 'text', type: 'string' },
      { key: 'page_width', source: 'page_width', type: 'double' },
      { key: 'page_height', source: 'page_height', type: 'double' },
      { key: 'match_start', source: 'match_start', type: 'long' },
      { key: 'excerpt', source: 'excerpt', type: 'string' }
    ]
  },
  topicSearch: COMPANION_TOPIC_SEARCH_QUERY,
  readableArticleActiveNodeId: {
    resultKey: 'rows',
    sql: "SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1",
    columns: [{ key: 'value', source: 'value', type: 'nullableString' }]
  },
  readableArticleByNodeId: {
    resultKey: 'articles',
    sql: androidReadableArticleSql("WHERE n.id = ? LIMIT 1"),
    columns: androidReadableArticleColumns()
  },
  readableArticleFirstNode: {
    resultKey: 'articles',
    sql:
      `${VISIBLE_NODES_CTE_SQL} ` +
      androidReadableArticleSql(
        "INNER JOIN visible_nodes visible ON visible.id = n.id WHERE n.body_blob_hash IS NOT NULL OR TRIM(COALESCE(n.content, '')) <> ''"
      ) +
      ' ORDER BY n.updated_at DESC, n.created_at DESC, n.id ASC LIMIT 1',
    columns: androidReadableArticleColumns()
  },
  readableArticleReferencePdfAttachment: {
    resultKey: 'attachments',
    sql: `SELECT (${androidReadableArticleReferencePdfAttachmentSql('?')}) AS attachment_id`,
    columns: [{ key: 'attachment_id', source: 'attachment_id', type: 'string' }]
  },
  nodeViewStatesByHost: {
    resultKey: 'states',
    sql: 'SELECT node_id, scroll_top, selection_from, selection_to, updated_at, source FROM node_view_state WHERE host_name = ?',
    columns: [
      { key: 'node_id', source: 'node_id', type: 'string' },
      { key: 'scroll_top', source: 'scroll_top', type: 'long' },
      { key: 'selection_from', source: 'selection_from', type: 'long' },
      { key: 'selection_to', source: 'selection_to', type: 'long' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'source', source: 'source', type: 'nullableString' }
    ]
  },
  nodeAttachmentBackfillSnapshots: {
    resultKey: 'snapshots',
    sql:
      'SELECT n.id, v.snapshot_json FROM nodes n ' +
      'INNER JOIN node_sync_versions v ON v.version_id = COALESCE(n.current_version_id, (' +
      'SELECT latest.version_id FROM node_sync_versions latest ' +
      'WHERE latest.object_id = n.id ORDER BY latest.created_at DESC, latest.version_id DESC LIMIT 1' +
      '))',
    columns: [
      { key: 'id', source: 'id', type: 'string' },
      { key: 'snapshot_json', source: 'snapshot_json', type: 'string' }
    ]
  },
  workspaceMetaValue: {
    resultKey: 'rows',
    sql: 'SELECT value FROM workspace_meta WHERE key = ? LIMIT 1',
    columns: [{ key: 'value', source: 'value', type: 'nullableString' }]
  },
  workspaceSnapshotNodes: COMPANION_WORKSPACE_DISPLAY_NODE_QUERY
};
