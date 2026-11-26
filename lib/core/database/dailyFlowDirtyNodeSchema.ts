import { DAILY_FLOW_LEARNING_COLUMNS } from './dailyFlowSchema.js';

/**
 * Local record of node ids whose Flow eligibility facts may have changed since the queue was
 * last checked. It is derived device state, never a sync fact: a consumer reads the ids, rechecks
 * only those nodes (and the subtrees they head), then deletes the rows it has handled.
 */
export const DAILY_FLOW_DIRTY_NODE_TABLE =
  'CREATE TABLE IF NOT EXISTS daily_flow_dirty_nodes (node_id TEXT PRIMARY KEY) WITHOUT ROWID';

const record = (id: string) =>
  `INSERT INTO daily_flow_dirty_nodes (node_id) VALUES (${id}) ON CONFLICT(node_id) DO NOTHING;`;
const invalidate = 'UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1;';

// Learning writes keep invalidating the sequence as before and now also name their node.
function learningTriggers() {
  return Object.entries(DAILY_FLOW_LEARNING_COLUMNS).flatMap(([table, columns]) => ['INSERT', 'UPDATE', 'DELETE'].flatMap(event => {
    const name = `daily_flow_${table}_${event.toLowerCase()}`;
    const changed = event === 'UPDATE' ? `WHEN ${columns.map(column => `OLD.${column} IS NOT NEW.${column}`).join(' OR ')}` : '';
    const ids = event === 'INSERT' ? record('NEW.node_id') : event === 'DELETE' ? record('OLD.node_id')
      : `${record('OLD.node_id')} ${record('NEW.node_id')}`;
    return [`DROP TRIGGER IF EXISTS ${name}`,
      `CREATE TRIGGER ${name} AFTER ${event} ON ${table} ${changed} BEGIN ${invalidate} ${ids} END`];
  }));
}

/** Node facts the Flow snapshot and its ordering read; changing one only records the id. */
const NODE_FACT_COLUMNS = ['parent_id', 'deleted_at', 'shelved_at', 'kind', 'priority', 'enforce_priority',
  'sequential_reading_enabled', 'manual_child_order', 'virtual_filter', 'title', 'created_at',
  'anchor_link', 'anchor_resolution_status'] as const;
const hasContent = (row: string) => `(${row}.body_blob_hash IS NOT NULL OR LENGTH(TRIM(${row}.content)) > 0)`;

const NODE_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS daily_flow_dirty_node_insert AFTER INSERT ON nodes BEGIN ${record('NEW.id')} END`,
  `CREATE TRIGGER IF NOT EXISTS daily_flow_dirty_node_delete AFTER DELETE ON nodes BEGIN ${record('OLD.id')} END`,
  `CREATE TRIGGER IF NOT EXISTS daily_flow_dirty_node_update AFTER UPDATE OF ${NODE_FACT_COLUMNS.join(', ')} ON nodes
    WHEN ${NODE_FACT_COLUMNS.map(column => `OLD.${column} IS NOT NEW.${column}`).join(' OR ')}
    BEGIN ${record('NEW.id')} END`,
  // Body and answer edits are frequent; only a flip between empty and non-empty matters.
  `CREATE TRIGGER IF NOT EXISTS daily_flow_dirty_node_content AFTER UPDATE OF content, body_blob_hash, reveal ON nodes
    WHEN ${hasContent('OLD')} IS NOT ${hasContent('NEW')} OR (OLD.reveal IS NULL) IS NOT (NEW.reveal IS NULL)
    BEGIN ${record('NEW.id')} END`
];

// Counts already taken out of the list for a node depend on its kind, which the node row no longer holds once it
// changes; such a change leaves only a whole-list check able to recount (image excerpts count as no kind).
const KIND_TRIGGER = `CREATE TRIGGER IF NOT EXISTS daily_flow_scope_kind AFTER UPDATE OF kind, anchor_link, anchor_resolution_status ON nodes
  WHEN OLD.kind IS NOT NEW.kind OR ((OLD.anchor_link IS NOT NEW.anchor_link OR OLD.anchor_resolution_status IS NOT NEW.anchor_resolution_status)
    AND (COALESCE(OLD.anchor_link, '') LIKE '%image-excerpt%' OR COALESCE(NEW.anchor_link, '') LIKE '%image-excerpt%'))
  BEGIN UPDATE daily_flow_state SET scope_complete = 0 WHERE id = 1; END`;

const READING_POSITION_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS daily_flow_dirty_reading_host_insert AFTER INSERT ON node_reading_host_state
    BEGIN ${record('NEW.node_id')} END`,
  `CREATE TRIGGER IF NOT EXISTS daily_flow_dirty_reading_host_update AFTER UPDATE OF node_id, reading_position ON node_reading_host_state
    WHEN OLD.node_id IS NOT NEW.node_id OR OLD.reading_position IS NOT NEW.reading_position
    BEGIN ${record('OLD.node_id')} ${record('NEW.node_id')} END`,
  `CREATE TRIGGER IF NOT EXISTS daily_flow_dirty_reading_host_delete AFTER DELETE ON node_reading_host_state
    BEGIN ${record('OLD.node_id')} END`
];

// Child order facts are keyed by parent id ('parent-child-order:root' for the top level).
const PARENT_ORDER_TRIGGERS = ['INSERT', 'UPDATE', 'DELETE'].map(event => {
  const ids = event === 'INSERT' ? record('NEW.parent_id') : event === 'DELETE' ? record('OLD.parent_id')
    : `${record('OLD.parent_id')} ${record('NEW.parent_id')}`;
  return `CREATE TRIGGER IF NOT EXISTS daily_flow_dirty_parent_order_${event.toLowerCase()}
    AFTER ${event} ON parent_order_sources BEGIN ${ids} END`;
});

/** Statements of the one schema step that adds dirty-node recording; safe to rerun. */
export const DAILY_FLOW_DIRTY_NODE_SCHEMA = [
  DAILY_FLOW_DIRTY_NODE_TABLE,
  ...learningTriggers(),
  ...NODE_TRIGGERS,
  KIND_TRIGGER,
  ...READING_POSITION_TRIGGERS,
  ...PARENT_ORDER_TRIGGERS
] as const;
