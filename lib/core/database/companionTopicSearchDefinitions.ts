import {
  androidSearchExcerptExpression
} from './androidCompanionDerivedReadSql.js';
import { SNAPSHOT_VISIBLE_NODES_CTE_SQL as VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

const CONTENT = 'n.content';
const STATUS = "CASE WHEN TRIM(COALESCE(n.content, '')) = '' THEN 'empty' ELSE 'ready' END";

export const COMPANION_TOPIC_SEARCH_RULES = {
  defaultSearchLimit: 20,
  excerptRadius: 80,
  maxSearchLimit: 100,
  requestKeys: { limit: 'limit', query: 'query' },
  responseKeys: { query: 'query', results: 'results' },
  resultKeys: {
    contentStatus: 'content_status',
    excerpt: 'excerpt',
    matchStart: 'match_start',
    nodeId: 'node_id',
    openingText: 'opening_text',
    title: 'title',
    updatedAt: 'updated_at'
  },
  searchQueryName: 'topicSearch',
  searchResultFields: [
    { outputKey: 'node_id', rowKey: 'id', type: 'string' },
    { outputKey: 'title', rowKey: 'title', type: 'string' },
    { outputKey: 'opening_text', rowKey: 'opening_text', type: 'nullableString' },
    { outputKey: 'content_status', rowKey: 'content_status', type: 'string' },
    { outputKey: 'updated_at', rowKey: 'updated_at', type: 'string' },
    { outputKey: 'match_start', rowKey: 'match_start', type: 'long' },
    { outputKey: 'excerpt', rowKey: 'excerpt', type: 'string' }
  ]
} as const;

export const COMPANION_TOPIC_SEARCH_QUERY = {
  resultKey: COMPANION_TOPIC_SEARCH_RULES.responseKeys.results,
  sql:
    `${VISIBLE_NODES_CTE_SQL} ` +
    "SELECT n.id, COALESCE(NULLIF(TRIM(n.title), ''), 'Untitled') AS title, n.opening_text, " +
    `${STATUS} AS content_status, n.updated_at, ` +
    `max(0, instr(lower(${CONTENT}), ?) - 1) AS match_start, ` +
    `${androidSearchExcerptExpression(CONTENT, '?', COMPANION_TOPIC_SEARCH_RULES.excerptRadius)} AS excerpt ` +
    'FROM nodes n ' +
    'INNER JOIN visible_nodes visible ON visible.id = n.id ' +
    "WHERE (instr(lower(COALESCE(n.title, '')), ?) > 0 OR instr(lower(COALESCE(n.opening_text, '')), ?) > 0 " +
    `OR instr(lower(${CONTENT}), ?) > 0) ` +
    'ORDER BY n.updated_at DESC, n.created_at DESC, n.id ASC LIMIT ?',
  columns: COMPANION_TOPIC_SEARCH_RULES.searchResultFields.map((field) => ({
    key: field.rowKey,
    source: field.rowKey,
    type: field.type
  }))
} as const;

export const COMPANION_TOPIC_SEARCH_HOST_CONTRACT = {
  ...COMPANION_TOPIC_SEARCH_RULES,
  sql: COMPANION_TOPIC_SEARCH_QUERY.sql
} as const;
