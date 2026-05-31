import type { DatabaseConnection } from './connection.js';

const INITIAL_INBOX_NODE_ID = 'special-inbox';
const INITIAL_VIRTUAL_ROOT_NODE_ID = 'special-virtual-root';
const INITIAL_ROOT_FOLDER_NODE_ID = 'starter-root-folder';
const INITIAL_WELCOME_NODE_ID = 'starter-welcome';
const ACTIVE_NODE_META_KEY = 'active_node_id';

const INITIAL_ROOT_FOLDER_TITLE = 'Untitled Folder';
const INITIAL_WELCOME_TITLE = 'Welcome to Foliole';
const INITIAL_WELCOME_CONTENT = `# Welcome to Foliole

Inbox is your capture shelf. Drop files here, import text when you need it, and turn rough material into folders, topics, and study items as you organize the workspace.

Start with this page, then add your first document or folder from the list toolbar.`;

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

function insertWelcomeDocument(connection: DatabaseConnection, timestamp: string) {
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, opening_text, virtual_filter, reveal, anchor_link, image_regions, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', NULL, NULL, ?, 1, 0, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
    [
      INITIAL_WELCOME_NODE_ID,
      INITIAL_INBOX_NODE_ID,
      INITIAL_WELCOME_TITLE,
      INITIAL_WELCOME_CONTENT,
      'Inbox is your capture shelf. Drop files here, import text when you need it, and turn rough material into folders, topics, and study items as you organize the workspace.',
      timestamp,
      timestamp
    ]
  );
}

function insertRootFolder(connection: DatabaseConnection, timestamp: string) {
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, opening_text, virtual_filter, reveal, anchor_link, image_regions, created_at, updated_at, deleted_at
     ) VALUES (?, NULL, 'folder', NULL, NULL, ?, 1, 0, '', NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
    [INITIAL_ROOT_FOLDER_NODE_ID, INITIAL_ROOT_FOLDER_TITLE, timestamp, timestamp]
  );
}

function insertInitialOrder(connection: DatabaseConnection) {
  connection.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [INITIAL_INBOX_NODE_ID, 0]);
  connection.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [INITIAL_ROOT_FOLDER_NODE_ID, 1]);
  connection.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [INITIAL_VIRTUAL_ROOT_NODE_ID, 2]);
}

function setInitialActiveNode(connection: DatabaseConnection, timestamp: string) {
  connection.driver.execute(
    `INSERT INTO workspace_meta (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [ACTIVE_NODE_META_KEY, INITIAL_WELCOME_NODE_ID, timestamp]
  );
}

export function seedInitialWorkspace(connection: DatabaseConnection) {
  if (hasWorkspaceNodes(connection)) {
    return;
  }

  const timestamp = new Date().toISOString();
  connection.driver.transaction((driver) => {
    const transactionalConnection = { ...connection, driver };
    insertInboxRoot(transactionalConnection, timestamp);
    insertRootFolder(transactionalConnection, timestamp);
    insertVirtualRoot(transactionalConnection, timestamp);
    insertWelcomeDocument(transactionalConnection, timestamp);
    insertInitialOrder(transactionalConnection);
    setInitialActiveNode(transactionalConnection, timestamp);
  });
}
