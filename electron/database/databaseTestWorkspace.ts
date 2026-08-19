import { openDatabaseConnection } from './connection.js';

export function resetSeededWorkspace() {
  openDatabaseConnection().sqlite.exec(`
    DELETE FROM mirror_articles;
    DELETE FROM incoming_updates;
    DELETE FROM node_attachments;
    DELETE FROM review_log;
    DELETE FROM node_sync_versions;
    DELETE FROM node_reading;
    DELETE FROM node_reading_host_state;
    DELETE FROM node_review;
    DELETE FROM node_order;
    DELETE FROM workspace_meta;
    DELETE FROM nodes;
  `);
}
