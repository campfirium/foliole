#!/usr/bin/env node
/* global console, process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import BetterSqlite3 from 'better-sqlite3';

export function inspectSyncGroupRecoveryDatabase(databasePath) {
  const db = new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
  try {
    const count = (sql) => Number(db.prepare(sql).pluck().get() ?? 0);
    return {
      activeMemberCount: count("SELECT COUNT(*) FROM sync_group_members WHERE state = 'active'"),
      attachmentCount: count('SELECT COUNT(*) FROM attachments'),
      contentBlobCount: count('SELECT COUNT(*) FROM content_blobs'),
      missingAttachmentCount: count("SELECT COUNT(*) FROM attachment_blobs WHERE availability != 'cached'"),
      missingContentBlobCount: count(`SELECT COUNT(*) FROM content_blobs cb
        LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL`),
      nodeCount: count('SELECT COUNT(*) FROM nodes'),
      reviewLogCount: count('SELECT COUNT(*) FROM review_log')
    };
  } finally { db.close(); }
}

function main(argv) {
  if (argv.length !== 1) throw new Error('usage: electron inspect.mjs <database-path>');
  console.log(JSON.stringify(inspectSyncGroupRecoveryDatabase(path.resolve(argv[0]))));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`[sync-group-recovery-inspect] ${error.message}`);
    process.exitCode = 1;
  }
}
