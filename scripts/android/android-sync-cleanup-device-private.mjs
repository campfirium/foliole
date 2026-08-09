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

function companionDeviceId(db) {
  if (!tableExists(db, 'companion_meta')) return null;
  return db.prepare("SELECT value FROM companion_meta WHERE key = 'device_id'").get()?.value ?? null;
}

function inspectDevicePrivateResidue(databasePath) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const deviceId = companionDeviceId(db);
    return {
      databasePath,
      deviceId,
      nodeReadingDeviceState: residueRows(db, 'node_reading_device_state', deviceId),
      nodeViewState: residueRows(db, 'node_view_state', deviceId),
      deliveryReceipts: viewStateDeliveryRows(db),
      viewStateSyncObjects: viewStateSyncRows(db)
    };
  } finally {
    db.close();
  }
}

function residueRows(db, table, deviceId) {
  if (!deviceId || !tableExists(db, table)) return [];
  return db.prepare(`SELECT rowid, device_id FROM ${table} WHERE device_id <> ? ORDER BY rowid`).all(deviceId);
}

function viewStateSyncRows(db) {
  if (!tableExists(db, 'sync_object_state')) return [];
  return db.prepare(
    "SELECT rowid, object_id FROM sync_object_state WHERE object_type = 'view_state' ORDER BY rowid"
  ).all();
}

function viewStateDeliveryRows(db) {
  if (!tableExists(db, 'sync_delivery_receipts')) return [];
  return db.prepare(
    "SELECT rowid, object_id FROM sync_delivery_receipts WHERE object_type = 'view_state' ORDER BY rowid"
  ).all();
}

function cleanupDevicePrivateResidue(databasePath, options = {}) {
  const report = inspectDevicePrivateResidue(databasePath);
  if (!options.apply || !options.destructive) return { ...report, applied: false };
  const db = new Database(databasePath, { fileMustExist: true });
  try {
    db.transaction(() => {
      deleteRowids(db, 'node_reading_device_state', report.nodeReadingDeviceState);
      deleteRowids(db, 'node_view_state', report.nodeViewState);
      deleteRowids(db, 'sync_delivery_receipts', report.deliveryReceipts);
      deleteRowids(db, 'sync_object_state', report.viewStateSyncObjects);
    })();
  } finally {
    db.close();
  }
  return { ...inspectDevicePrivateResidue(databasePath), applied: true };
}

function deleteRowids(db, table, rows) {
  if (rows.length === 0) return;
  const statement = db.prepare(`DELETE FROM ${table} WHERE rowid = ?`);
  for (const row of rows) statement.run(row.rowid);
}

function formatCleanupReport(report) {
  return [
    `[android-sync-cleanup-device-private] db=${report.databasePath}`,
    `[android-sync-cleanup-device-private] local_device_id=${report.deviceId ?? 'missing'}`,
    `[android-sync-cleanup-device-private] node_view_state_non_local=${report.nodeViewState.length}`,
    `[android-sync-cleanup-device-private] node_reading_device_state_non_local=${report.nodeReadingDeviceState.length}`,
    `[android-sync-cleanup-device-private] view_state_sync_object_rows=${report.viewStateSyncObjects.length}`,
    `[android-sync-cleanup-device-private] view_state_delivery_receipt_rows=${report.deliveryReceipts.length}`,
    `[android-sync-cleanup-device-private] applied=${report.applied ? 'yes' : 'no'}`
  ].join('\n');
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.databasePath) throw new Error('Missing --db <android.db>.');
  const report = cleanupDevicePrivateResidue(path.resolve(options.databasePath), options);
  console.log(formatCleanupReport(report));
  if (options.apply && !options.destructive) {
    console.log('[android-sync-cleanup-device-private] refused destructive delete without --destructive');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    runCli();
  } catch (error) {
    console.error(`[android-sync-cleanup-device-private] FAILED ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export {
  cleanupDevicePrivateResidue,
  formatCleanupReport,
  inspectDevicePrivateResidue,
  parseArgs
};
