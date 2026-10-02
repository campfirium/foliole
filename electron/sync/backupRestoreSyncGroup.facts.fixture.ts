import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { importImageAttachmentBytes } from '../attachments/importImageAttachmentBytes.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { loadBackupSettings, resolveManagedBackupDirectory } from '../database/backupSettings.js';
import { materializeCompressedSqliteBackup } from '../database/compressedSqliteBackup.js';
import { openDatabaseConnection } from '../database/connection.js';
import { softDeleteNodes } from '../database/nodeMutations.js';
import { saveNodeReadingState } from '../database/nodeReadingState.js';
import { loadNodeResourceReferences } from '../database/nodeResources.js';
import { applyReviewGrade } from '../database/reviewMutations.js';

export async function appendRestoreFacts() {
  const now = new Date().toISOString();
  const card = { due: now, last_review: null, state: 0 as const, stability: 0,
    difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0 };
  applyReviewGrade({ nodeId: 'topic', grade: 3, reviewedAt: now, schedulerVersion: 'fixture',
    cardBefore: card, cardAfter: { ...card, state: 2, reps: 1, last_review: now } });
  saveNodeReadingState({ nodeId: 'topic', updatedAt: now, reading: { state: 'active',
    intervalDurationMs: 86400000, intervalGrowthFactor: 2, lastHandledAt: now, nextAt: now,
    priority: 1, readingPosition: 0.5, repetitionCount: 1 } });
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=', 'base64');
  const result = await importImageAttachmentBytes({ nodeId: 'topic', bytes, mimeType: 'image/png',
    originalName: 'Restore image.png', errorSource: 'fixture' });
  if (result.status === 'error') throw new Error(result.message);
}

export function deletePausedNode() {
  softDeleteNodes({ nodeIds: ['delete-me'], deletedAt: new Date().toISOString() });
}

export async function restoreFactsSnapshot() {
  const driver = openDatabaseConnection().driver;
  const resources = await Promise.all(loadNodeResourceReferences('topic').map(async (reference) => ({
    ...reference, bytes: (await fs.readFile(resolveAttachmentStoragePath(reference.storage_key.slice(0, 64), undefined, 'image/png'))).toString('base64')
  })));
  return { reviews: driver.queryAll('SELECT * FROM review_log ORDER BY op_id'),
    reading: driver.queryAll('SELECT * FROM node_reading ORDER BY node_id'), resources };
}

export async function safetySnapshotFacts() {
  const directory = resolveManagedBackupDirectory(loadBackupSettings());
  const names = (await fs.readdir(directory)).filter((name) => name.includes('rollback'));
  const snapshots = [];
  for (const name of names) {
    const materialized = await materializeCompressedSqliteBackup(path.join(directory, name), directory);
    const db = new Database(materialized.databasePath, { readonly: true, fileMustExist: true });
    try {
      snapshots.push({ nodes: db.prepare('SELECT id FROM nodes ORDER BY id').all(),
        versions: db.prepare('SELECT body_text FROM node_sync_versions ORDER BY version_id').all() });
    } finally { db.close(); await materialized.cleanup(); }
  }
  return snapshots;
}
