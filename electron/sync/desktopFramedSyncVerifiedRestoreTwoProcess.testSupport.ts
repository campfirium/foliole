import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { materializeCompressedSqliteBackup } from '../database/compressedSqliteBackup.js';

import { verifiedReceiverArticle } from './desktopFramedSyncVerifiedTwoProcess.testSupport.js';

export function restoreBusinessRows(databasePath: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state',
      'content_bodies', 'content_body_chunks', 'content_blobs', 'node_version_local_proof_state',
      'node_version_local_source_revisions', 'node_version_device_revisions', 'node_version_local_origins',
      'node_version_local_holds', 'parent_child_order', 'sync_group_metadata', 'sync_group_restore_events',
      'search_index_invalidations', 'framed_sync_inventory', 'framed_sync_version_summary',
      'framed_sync_fact_summary', 'framed_sync_resource_availability', 'framed_sync_receipts']
      .map((table) => ({ table, rows: sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() }));
  } finally { sqlite.close(); }
}

export function restoreIdentityState(databasePath: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return {
      metadata: sqlite.prepare('SELECT key, value FROM sync_group_metadata ORDER BY key').all(),
      restores: sqlite.prepare('SELECT restore_id, applied_at FROM sync_group_restore_events ORDER BY restore_id').all()
    };
  } finally { sqlite.close(); }
}

export async function preservedRestoreArticle(directory: string, root: string, nodeId: string) {
  const names = await fs.readdir(directory);
  const backup = names.find((name) => /\.db(?:\.gz)?$/u.test(name));
  if (!backup) throw new Error('two_process_restore_safety_backup_missing');
  const opened = await materializeCompressedSqliteBackup(path.join(directory, backup), root);
  try { return await verifiedReceiverArticle(opened.databasePath, nodeId); }
  finally { await opened.cleanup(); }
}
