// @vitest-environment node

import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, normalizeReviewSchedulerSettings } from '../../lib/core/review/settings.ts';

import { selectReviewAcceptanceObjects } from './windows-android-lab-review-selection.ts';

const roots = [];
const NOW = '2026-07-26T00:00:00.000Z';

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function createDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-review-selection-'));
  roots.push(root);
  const db = new Database(path.join(root, 'review.db'));
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT, priority INTEGER, shelved_at TEXT,
      content TEXT, body_blob_hash TEXT, reveal TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, availability TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
    CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER);
    CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT);
    CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, next_at TEXT, priority INTEGER, state TEXT);
  `);
  return db;
}

function insertNode(db, args) {
  db.prepare('INSERT INTO nodes VALUES (?, NULL, ?, 0, NULL, ?, ?, ?, ?, ?, NULL)').run(
    args.id,
    args.kind,
    args.bodyHash ? '' : args.body ?? `body ${args.id}`,
    args.bodyHash ?? null,
    args.reveal ?? null,
    '2026-07-20T00:00:00.000Z',
    '2026-07-25T00:00:00.000Z'
  );
  if (args.bodyHash) db.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run(args.bodyHash, Buffer.from(args.body ?? 'blob body'));
  db.prepare('INSERT INTO node_order VALUES (?, ?)').run(args.id, args.position);
}

describe('Windows Android lab Review acceptance selection', () => {
  it('treats Android body blob data as readable Topic content for the shared planner', () => {
    const db = createDatabase();
    insertNode(db, { id: 'fsrs-1', kind: 'item', position: 0, reveal: 'answer' });
    db.prepare('INSERT INTO node_review VALUES (?, ?)').run('fsrs-1', '2026-07-25T00:00:00.000Z');
    ['read-1', 'read-2', 'read-3'].forEach((id, index) => {
      insertNode(db, { body: `synced topic body ${index}`, bodyHash: `hash-${index}`, id, kind: 'topic', position: index + 1 });
      db.prepare('INSERT INTO node_reading VALUES (?, ?, 0, ?)').run(id, '2026-07-25T00:00:00.000Z', 'active');
    });

    expect(selectReviewAcceptanceObjects(
      db,
      normalizeReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS),
      NOW
    )).toMatchObject({
      status: 'available',
      value: {
        fsrsNodeId: 'fsrs-1',
        fsrsNodeIds: ['fsrs-1'],
        expectedActions: [
          { action: 'grade', itemKind: 'fsrs', nodeId: 'fsrs-1' },
          { action: 'read', itemKind: 'reading', nodeId: 'read-1' },
          { action: 'later', itemKind: 'reading', nodeId: 'read-2' },
          { action: 'dismiss', itemKind: 'reading', nodeId: 'read-3' }
        ],
        queuePrefix: [
          { itemKind: 'fsrs', nodeId: 'fsrs-1' },
          { itemKind: 'reading', nodeId: 'read-1' },
          { itemKind: 'reading', nodeId: 'read-2' },
          { itemKind: 'reading', nodeId: 'read-3' }
        ],
        readingNodeIds: ['read-1', 'read-2', 'read-3']
      }
    });
    db.close();
  });

  it('binds extra FSRS items before Reading actions to the actual UI queue', () => {
    const db = createDatabase();
    ['fsrs-1', 'fsrs-2'].forEach((id, index) => {
      insertNode(db, { id, kind: 'item', position: index, reveal: 'answer' });
      db.prepare('INSERT INTO node_review VALUES (?, ?)').run(id, '2026-07-25T00:00:00.000Z');
    });
    ['read-1', 'read-2', 'read-3'].forEach((id, index) => {
      insertNode(db, { body: `topic ${index}`, id, kind: 'topic', position: index + 2 });
      db.prepare('INSERT INTO node_reading VALUES (?, ?, 0, ?)').run(id, '2026-07-25T00:00:00.000Z', 'active');
    });

    expect(selectReviewAcceptanceObjects(
      db,
      normalizeReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS),
      NOW
    )).toMatchObject({
      status: 'available',
      value: {
        expectedActions: [
          { action: 'grade', itemKind: 'fsrs', nodeId: 'fsrs-1' },
          { action: 'grade', itemKind: 'fsrs', nodeId: 'fsrs-2' },
          { action: 'read', itemKind: 'reading', nodeId: 'read-1' },
          { action: 'later', itemKind: 'reading', nodeId: 'read-2' },
          { action: 'dismiss', itemKind: 'reading', nodeId: 'read-3' }
        ],
        fsrsNodeIds: ['fsrs-1', 'fsrs-2'],
        queuePrefix: [
          { itemKind: 'fsrs', nodeId: 'fsrs-1' },
          { itemKind: 'fsrs', nodeId: 'fsrs-2' },
          { itemKind: 'reading', nodeId: 'read-1' },
          { itemKind: 'reading', nodeId: 'read-2' },
          { itemKind: 'reading', nodeId: 'read-3' }
        ]
      }
    });
    db.close();
  });
});
