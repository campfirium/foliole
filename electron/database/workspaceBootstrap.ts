import type { DatabaseConnection } from './connection.js';

const INITIAL_INBOX_NODE_ID = 'special-inbox';
const INITIAL_VIRTUAL_ROOT_NODE_ID = 'special-virtual-root';

function hasWorkspaceNodes(connection: DatabaseConnection) {
  const row = connection.driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM nodes');
  return (row?.count ?? 0) > 0;
}

function insertInboxRoot(connection: DatabaseConnection, timestamp: string) {
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, opening_text, virtual_filter, reveal, anchor_link, image_regions, created_at, updated_at, deleted_at
     ) VALUES (?, NULL, 'folder', NULL, NULL, ?, 1, 0, '', NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
    [INITIAL_INBOX_NODE_ID, 'Inbox', timestamp, timestamp]
  );
}

function insertVirtualRoot(connection: DatabaseConnection, timestamp: string) {
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, opening_text, virtual_filter, reveal, anchor_link, image_regions, created_at, updated_at, deleted_at
     ) VALUES (?, NULL, 'folder', NULL, NULL, 'Virtual', 1, 0, '', NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
    [INITIAL_VIRTUAL_ROOT_NODE_ID, timestamp, timestamp]
  );
}

function insertInitialOrder(connection: DatabaseConnection) {
  connection.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [INITIAL_INBOX_NODE_ID, 0]);
  connection.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [INITIAL_VIRTUAL_ROOT_NODE_ID, 1]);
}

export function seedInitialWorkspace(connection: DatabaseConnection) {
  if (hasWorkspaceNodes(connection)) {
    return;
  }

  const timestamp = new Date().toISOString();
  connection.driver.transaction((driver) => {
    const transactionalConnection = { ...connection, driver };
    insertInboxRoot(transactionalConnection, timestamp);
    insertVirtualRoot(transactionalConnection, timestamp);
    insertInitialOrder(transactionalConnection);
  });
}
