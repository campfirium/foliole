import { openDatabaseConnection } from '../database/connection.js';

export function resetMirrorTestWorkspace() {
  openDatabaseConnection().sqlite.exec(`
    DELETE FROM mirror_articles;
    DELETE FROM node_attachments;
    DELETE FROM node_reading;
    DELETE FROM node_review;
    DELETE FROM node_order;
    DELETE FROM workspace_meta;
    DELETE FROM nodes;
  `);
}
