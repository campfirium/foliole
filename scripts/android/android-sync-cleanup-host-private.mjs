#!/usr/bin/env node
/* global console, process */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const options = { apply: false, databasePath: process.env.FOLIOLE_ANDROID_DB || '', destructive: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--apply') options.apply = true;
    if (key === '--destructive') options.destructive = true;
    if ((key === '--db' || key === '--android-db') && value) {
      options.databasePath = value;
      index += 1;
    }
  }
  return options;
}

function tableExists(db, table) {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

function companionHostName(db) {
  if (!tableExists(db, 'companion_meta')) return null;
  return db.prepare("SELECT value FROM companion_meta WHERE key = 'host_name'").get()?.value ?? null;
}

function inspectHostPrivateResidue(databasePath) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const hostName = companionHostName(db);
    return {
      databasePath,
      hostName,
      nodeReadingHostState: residueRows(db, 'node_reading_host_state', hostName),
      nodeViewState: residueRows(db, 'node_view_state', hostName),
      deliveryReceipts: viewStateDeliveryRows(db, hostName),
      viewStateSyncObjects: viewStateSyncRows(db, hostName)
    };
  } finally {
    db.close();
  }
}

function residueRows(db, table, hostName) {
  if (!hostName || !tableExists(db, table)) return [];
  return db.prepare(`SELECT rowid, host_name FROM ${table} WHERE host_name <> ? ORDER BY rowid`).all(hostName);
}

function viewStateSyncRows(db, hostName) {
  if (!hostName || !tableExists(db, 'sync_object_state')) return [];
  return db.prepare(
    "SELECT rowid, object_id FROM sync_object_state WHERE object_type = 'view_state' AND object_id NOT LIKE ? ORDER BY rowid"
  ).all(`%:${hostName}:%`);
}

function viewStateDeliveryRows(db, hostName) {
  if (!hostName || !tableExists(db, 'sync_delivery_receipts')) return [];
  return db.prepare(
    "SELECT rowid, object_id FROM sync_delivery_receipts WHERE object_type = 'view_state' AND object_id NOT LIKE ? ORDER BY rowid"
  ).all(`%:${hostName}:%`);
}

function cleanupHostPrivateResidue(databasePath, options = {}) {
  const report = inspectHostPrivateResidue(databasePath);
  if (!options.apply || !options.destructive) return { ...report, applied: false };
  const db = new Database(databasePath, { fileMustExist: true });
  try {
    db.transaction(() => {
      deleteRowids(db, 'node_reading_host_state', report.nodeReadingHostState);
      deleteRowids(db, 'node_view_state', report.nodeViewState);
      deleteRowids(db, 'sync_delivery_receipts', report.deliveryReceipts);
      deleteRowids(db, 'sync_object_state', report.viewStateSyncObjects);
    })();
  } finally {
    db.close();
  }
  return { ...inspectHostPrivateResidue(databasePath), applied: true };
}

function deleteRowids(db, table, rows) {
  if (rows.length === 0) return;
  const statement = db.prepare(`DELETE FROM ${table} WHERE rowid = ?`);
  for (const row of rows) statement.run(row.rowid);
}

function formatCleanupReport(report) {
  return [
    `[android-sync-cleanup-host-private] db=${report.databasePath}`,
    `[android-sync-cleanup-host-private] local_host_name=${report.hostName ?? 'missing'}`,
    `[android-sync-cleanup-host-private] node_view_state_non_local=${report.nodeViewState.length}`,
    `[android-sync-cleanup-host-private] node_reading_host_state_non_local=${report.nodeReadingHostState.length}`,
    `[android-sync-cleanup-host-private] view_state_sync_object_rows=${report.viewStateSyncObjects.length}`,
    `[android-sync-cleanup-host-private] view_state_delivery_receipt_rows=${report.deliveryReceipts.length}`,
    `[android-sync-cleanup-host-private] applied=${report.applied ? 'yes' : 'no'}`
  ].join('\n');
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.databasePath) throw new Error('Missing --db <android.db>.');
  const report = cleanupHostPrivateResidue(path.resolve(options.databasePath), options);
  console.log(formatCleanupReport(report));
  if (options.apply && !options.destructive) {
    console.log('[android-sync-cleanup-host-private] refused destructive delete without --destructive');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    runCli();
  } catch (error) {
    console.error(`[android-sync-cleanup-host-private] FAILED ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export {
  cleanupHostPrivateResidue,
  formatCleanupReport,
  inspectHostPrivateResidue,
  parseArgs
};
