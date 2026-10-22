import type { DatabaseMigrationTarget } from './migrationTypes.js';

/** Child ids of a stored order, or none when the stored list is not a JSON array. */
function childIdsOf(order: string) {
  return `json_each(COALESCE(CASE WHEN json_valid(${order}.child_ids_json)
    THEN CASE WHEN json_type(${order}.child_ids_json) = 'array' THEN ${order}.child_ids_json END END, '[]'))`;
}

function insertMembers(order: string, from: string) {
  return `INSERT OR IGNORE INTO parent_child_order_members (parent_id, child_id)
    SELECT ${order}.parent_id, member.value FROM ${from}${childIdsOf(order)} member WHERE member.type = 'text'`;
}

/** Which stored orders list a node, so a save reads only those lists instead of every order. */
export const PARENT_CHILD_ORDER_MEMBER_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS parent_child_order_members (
    parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY (parent_id, child_id)) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS idx_parent_child_order_members_child
    ON parent_child_order_members(child_id, parent_id)`,
  `CREATE TRIGGER IF NOT EXISTS trg_parent_child_order_members_insert AFTER INSERT ON parent_child_order BEGIN
    INSERT OR IGNORE INTO parent_child_order_members (parent_id, child_id)
    SELECT NEW.parent_id, member.value FROM json_each(COALESCE(CASE WHEN json_valid(NEW.child_ids_json)
      THEN CASE WHEN json_type(NEW.child_ids_json) = 'array' THEN NEW.child_ids_json END END, '[]')) member
    WHERE member.type = 'text';
  END`,
  `CREATE TRIGGER IF NOT EXISTS trg_parent_child_order_members_update
    AFTER UPDATE OF parent_id, child_ids_json ON parent_child_order BEGIN
    DELETE FROM parent_child_order_members WHERE parent_id = OLD.parent_id;
    INSERT OR IGNORE INTO parent_child_order_members (parent_id, child_id)
    SELECT NEW.parent_id, member.value FROM json_each(COALESCE(CASE WHEN json_valid(NEW.child_ids_json)
      THEN CASE WHEN json_type(NEW.child_ids_json) = 'array' THEN NEW.child_ids_json END END, '[]')) member
    WHERE member.type = 'text';
  END`,
  `CREATE TRIGGER IF NOT EXISTS trg_parent_child_order_members_delete AFTER DELETE ON parent_child_order BEGIN
    DELETE FROM parent_child_order_members WHERE parent_id = OLD.parent_id;
  END`
] as const;

export function migrateParentChildOrderMembers(db: DatabaseMigrationTarget) {
  for (const sql of PARENT_CHILD_ORDER_MEMBER_SCHEMA) db.exec(sql);
  db.exec('DELETE FROM parent_child_order_members');
  db.exec(insertMembers('parent_order', 'parent_child_order parent_order, '));
}
