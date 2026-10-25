#!/usr/bin/env node
/* global console, process */

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

import { companionPreviewDatabaseFile } from './android-web-dev.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ITEM_IDS = "SELECT id FROM nodes WHERE kind = 'item'";

// This is a local preview edit, never a mutation to synchronize to a device.
export async function resetCompanionPreviewReviews({ root = repoRoot } = {}) {
  const databaseFile = companionPreviewDatabaseFile(root, 'device');
  if (realpathSync(databaseFile) !== path.resolve(databaseFile)) {
    throw new Error('Refusing a preview database reached through a symbolic link.');
  }
  const db = new Database(databaseFile, { fileMustExist: true });
  try {
    const result = db.transaction(() => {
      const logs = db.prepare(`DELETE FROM review_log WHERE node_id IN (${ITEM_IDS})`).run().changes;
      const states = db.prepare(`DELETE FROM node_review WHERE node_id IN (${ITEM_IDS})`).run().changes;
      return { logs, states };
    }).immediate();
    return result;
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) throw new Error('This command takes no arguments.');
    const result = await resetCompanionPreviewReviews();
    console.log(`Reset ${result.states} item review states and deleted ${result.logs} review logs.`);
    console.log('Reload all companion preview pages before continuing to review.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
