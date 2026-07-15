import {
  androidBodyStatusExpression,
  androidReadableArticleColumns,
  androidReadableArticleReferencePdfAttachmentSql,
  androidReadableArticleSql,
  androidSearchExcerptExpression,
} from './androidCompanionDerivedReadSql.js';
import { VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

const TOPIC_INLINE_CONTENT = 'n.content';
const TOPIC_BODY_BLOB_DATA = 'CAST(cbd.data AS TEXT)';
const TOPIC_HAS_BODY_BLOB = "n.body_blob_hash IS NOT NULL AND TRIM(n.body_blob_hash) <> ''";
const TOPIC_CONTENT = `CASE WHEN ${TOPIC_HAS_BODY_BLOB} THEN ${TOPIC_BODY_BLOB_DATA} ELSE ${TOPIC_INLINE_CONTENT} END`;
const TOPIC_STATUS = androidBodyStatusExpression({
  availabilityExpression: 'cb.availability',
  bodyBlobDataExpression: TOPIC_BODY_BLOB_DATA,
  bodyBlobHashExpression: 'n.body_blob_hash',
  contentExpression: TOPIC_CONTENT,
  emptyWhenBlank: true
});

export const ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS = {
  nodeAttachments: {
    resultKey: 'attachments',
    sql:
      'SELECT na.attachment_id, na.role, a.mime_type, a.original_name ' +
      'FROM node_attachments na LEFT JOIN attachments a ON a.id = na.attachment_id ' +
      'WHERE na.node_id = ? ORDER BY na.role ASC, na.attachment_id ASC',
    columns: [
      { key: 'attachmentId', source: 'attachment_id', type: 'string' },
      { key: 'role', source: 'role', type: 'string' },
      { key: 'mimeType', source: 'mime_type', type: 'nullableString' },
      { key: 'originalName', source: 'original_name', type: 'nullableString' }
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
      'FROM pdf_page_text WHERE instr(lower(text), ?) > 0 ORDER BY attachment_id ASC, page ASC LIMIT ?',
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
  topicSearch: {
    resultKey: 'results',
    sql:
      `${VISIBLE_NODES_CTE_SQL} ` +
      'SELECT n.id, COALESCE(NULLIF(TRIM(n.title), \'\'), \'Untitled\') AS title, n.opening_text, ' +
      `${TOPIC_STATUS} AS content_status, n.updated_at, ` +
      'max(0, instr(lower(' + TOPIC_CONTENT + '), ?) - 1) AS match_start, ' +
      `${androidSearchExcerptExpression(TOPIC_CONTENT, '?', 80)} AS excerpt ` +
      'FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash ' +
      'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash ' +
      'INNER JOIN visible_nodes visible ON visible.id = n.id ' +
      'WHERE (instr(lower(COALESCE(n.title, \'\')), ?) > 0 OR instr(lower(COALESCE(n.opening_text, \'\')), ?) > 0 ' +
      `OR instr(lower(${TOPIC_CONTENT}), ?) > 0) ` +
      'ORDER BY n.updated_at DESC, n.created_at DESC, n.id ASC LIMIT ?',
    columns: [
      { key: 'id', source: 'id', type: 'string' },
      { key: 'title', source: 'title', type: 'string' },
      { key: 'opening_text', source: 'opening_text', type: 'nullableString' },
      { key: 'content_status', source: 'content_status', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'match_start', source: 'match_start', type: 'long' },
      { key: 'excerpt', source: 'excerpt', type: 'string' }
    ]
  },
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
  nodeViewStatesByDevice: {
    resultKey: 'states',
    sql: 'SELECT node_id, scroll_top, selection_from, selection_to, updated_at, source FROM node_view_state WHERE device_id = ?',
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
  workspaceOrderedNodeIds: {
    resultKey: 'nodes',
    sql:
      `${VISIBLE_NODES_CTE_SQL} ` +
      'SELECT n.id FROM nodes n INNER JOIN visible_nodes visible ON visible.id = n.id LEFT JOIN node_order no ON no.node_id = n.id ' +
      'ORDER BY COALESCE(no.position, 2147483647) ASC, ' +
      'n.updated_at DESC, n.created_at DESC, n.id ASC',
    columns: [{ key: 'id', source: 'id', type: 'string' }]
  },
  workspaceMetaValue: {
    resultKey: 'rows',
    sql: 'SELECT value FROM workspace_meta WHERE key = ? LIMIT 1',
    columns: [{ key: 'value', source: 'value', type: 'nullableString' }]
  },
  workspaceSnapshotNodes: {
    resultKey: 'nodes',
    sql:
      `${VISIBLE_NODES_CTE_SQL} ` +
      'SELECT n.id, n.parent_id, n.kind, n.priority, n.desired_retention, n.enable_short_term, n.sequential_reading_enabled, n.shelved_at, n.manual_child_order, n.title, n.is_title_manual, ' +
      'n.hide_title_heading, __CONTENT_EXPRESSION__ AS content, n.opening_text, __BODY_STATUS_EXPRESSION__ AS body_status, ' +
      'n.virtual_filter, n.reveal, n.anchor_link, n.image_regions, n.import_source_fingerprint, n.import_content_fingerprint, ' +
      'n.created_at, n.updated_at, n.deleted_at, n.current_version_id, ' +
      '(SELECT no.position FROM node_order no WHERE no.node_id = n.id) AS position, ' +
      'rd.interval_duration_ms, rd.interval_growth_factor, rd.last_handled_at, rd.next_at, rd.priority AS reading_priority, ' +
      'rds.reading_position, rd.repetition_count, rd.state AS reading_state, nr.due, nr.last_review_at, nr.state AS review_state, ' +
      'nr.stability, nr.difficulty, nr.elapsed_days, nr.scheduled_days, nr.reps, nr.lapses, n.body_blob_hash ' +
      'FROM nodes n LEFT JOIN visible_nodes visible ON visible.id = n.id __CONTENT_BLOB_JOIN__ ' +
      'LEFT JOIN node_reading rd ON rd.node_id = n.id AND visible.id IS NOT NULL ' +
      'LEFT JOIN node_reading_device_state rds ON rds.node_id = n.id AND rds.device_id = ? AND visible.id IS NOT NULL ' +
      'LEFT JOIN node_review nr ON nr.node_id = n.id AND visible.id IS NOT NULL ' +
      'ORDER BY COALESCE((SELECT no.position FROM node_order no WHERE no.node_id = n.id), 2147483647), ' +
      'n.updated_at DESC, n.created_at DESC, n.id ASC',
    columns: [
      { key: 'id', source: 'id', type: 'string' },
      { key: 'parent_id', source: 'parent_id', type: 'nullableString' },
      { key: 'kind', source: 'kind', type: 'nullableString' },
      { key: 'priority', source: 'priority', type: 'long' },
      { key: 'desired_retention', source: 'desired_retention', type: 'double' },
      { key: 'enable_short_term', source: 'enable_short_term', type: 'long' },
      { key: 'sequential_reading_enabled', source: 'sequential_reading_enabled', type: 'long' },
      { key: 'shelved_at', source: 'shelved_at', type: 'nullableString' },
      { key: 'manual_child_order', source: 'manual_child_order', type: 'nullableString' },
      { key: 'title', source: 'title', type: 'nullableString' },
      { key: 'is_title_manual', source: 'is_title_manual', type: 'long' },
      { key: 'hide_title_heading', source: 'hide_title_heading', type: 'long' },
      { key: 'content', source: 'content', type: 'nullableString' },
      { key: 'opening_text', source: 'opening_text', type: 'nullableString' },
      { key: 'body_status', source: 'body_status', type: 'string' },
      { key: 'virtual_filter', source: 'virtual_filter', type: 'nullableString' },
      { key: 'reveal', source: 'reveal', type: 'nullableString' },
      { key: 'anchor_link', source: 'anchor_link', type: 'nullableString' },
      { key: 'image_regions', source: 'image_regions', type: 'nullableString' },
      { key: 'import_source_fingerprint', source: 'import_source_fingerprint', type: 'nullableString' },
      { key: 'import_content_fingerprint', source: 'import_content_fingerprint', type: 'nullableString' },
      { key: 'created_at', source: 'created_at', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'deleted_at', source: 'deleted_at', type: 'nullableString' },
      { key: 'current_version_id', source: 'current_version_id', type: 'nullableString' },
      { key: 'position', source: 'position', type: 'long' },
      { key: 'interval_duration_ms', source: 'interval_duration_ms', type: 'long' },
      { key: 'interval_growth_factor', source: 'interval_growth_factor', type: 'double' },
      { key: 'last_handled_at', source: 'last_handled_at', type: 'nullableString' },
      { key: 'next_at', source: 'next_at', type: 'nullableString' },
      { key: 'reading_priority', source: 'reading_priority', type: 'double' },
      { key: 'reading_position', source: 'reading_position', type: 'long' },
      { key: 'repetition_count', source: 'repetition_count', type: 'long' },
      { key: 'reading_state', source: 'reading_state', type: 'nullableString' },
      { key: 'due', source: 'due', type: 'nullableString' },
      { key: 'last_review_at', source: 'last_review_at', type: 'nullableString' },
      { key: 'review_state', source: 'review_state', type: 'long' },
      { key: 'stability', source: 'stability', type: 'double' },
      { key: 'difficulty', source: 'difficulty', type: 'double' },
      { key: 'elapsed_days', source: 'elapsed_days', type: 'long' },
      { key: 'scheduled_days', source: 'scheduled_days', type: 'long' },
      { key: 'reps', source: 'reps', type: 'long' },
      { key: 'lapses', source: 'lapses', type: 'long' },
      { key: 'body_blob_hash', source: 'body_blob_hash', type: 'nullableString' }
    ]
  }
};
