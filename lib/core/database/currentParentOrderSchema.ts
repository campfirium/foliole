export const CURRENT_PARENT_ORDER_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS parent_order_sources (
    parent_id TEXT NOT NULL, author_id TEXT NOT NULL,
    counter INTEGER NOT NULL CHECK (counter >= 0 AND counter <= 9007199254740991),
    child_ids_json TEXT NOT NULL, PRIMARY KEY (parent_id, author_id))`,
  `CREATE TABLE IF NOT EXISTS parent_order_writer (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    binding_id TEXT NOT NULL, source_epoch TEXT NOT NULL, author_id TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS parent_order_projection_pending (parent_id TEXT PRIMARY KEY)`,
  `CREATE TRIGGER IF NOT EXISTS trg_parent_order_node_insert AFTER INSERT ON nodes BEGIN
    INSERT INTO parent_order_projection_pending VALUES (COALESCE(NEW.parent_id, 'parent-child-order:root')) ON CONFLICT(parent_id) DO NOTHING;
  END`,
  `CREATE TRIGGER IF NOT EXISTS trg_parent_order_node_update
    AFTER UPDATE OF parent_id, title, deleted_at ON nodes BEGIN
    INSERT INTO parent_order_projection_pending VALUES (COALESCE(OLD.parent_id, 'parent-child-order:root')) ON CONFLICT(parent_id) DO NOTHING;
    INSERT INTO parent_order_projection_pending VALUES (COALESCE(NEW.parent_id, 'parent-child-order:root')) ON CONFLICT(parent_id) DO NOTHING;
  END`,
  `CREATE TRIGGER IF NOT EXISTS trg_parent_order_node_delete AFTER DELETE ON nodes BEGIN
    INSERT INTO parent_order_projection_pending VALUES (COALESCE(OLD.parent_id, 'parent-child-order:root')) ON CONFLICT(parent_id) DO NOTHING;
  END`
] as const;

export const PARENT_ORDER_SOURCES_SQL = `SELECT author_id AS authorId, counter, child_ids_json
  FROM parent_order_sources WHERE parent_id = ? ORDER BY author_id`;
export const PARENT_ORDER_MEMBERS_SQL = `SELECT id, title, created_at AS createdAt FROM nodes
  WHERE parent_id = ? OR (parent_id IS NULL AND ? = 'parent-child-order:root')`;
export const PARENT_ORDER_SOURCE_WRITE_SQL = `INSERT INTO parent_order_sources
  (parent_id, author_id, counter, child_ids_json) VALUES (?, ?, ?, ?)
  ON CONFLICT(parent_id, author_id) DO UPDATE SET counter = excluded.counter,
    child_ids_json = excluded.child_ids_json`;
export const PARENT_ORDER_MATERIALIZE_SQL = `INSERT INTO parent_child_order
  (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(parent_id) DO UPDATE SET
    child_ids_json = excluded.child_ids_json, updated_at = excluded.updated_at
  WHERE parent_child_order.child_ids_json <> excluded.child_ids_json`;
export const PARENT_ORDER_PAYLOAD_SQL = `SELECT json_object('parent_id', parent_id,
  'sources_json', COALESCE((SELECT json_group_array(json(source)) FROM (
    SELECT json_object('authorId', author_id, 'counter', counter,
      'childIds', json(child_ids_json)) AS source FROM parent_order_sources
    WHERE parent_id = parent_child_order.parent_id ORDER BY author_id)), '[]') || '') AS payload_json
  FROM parent_child_order WHERE parent_id = ?`;
