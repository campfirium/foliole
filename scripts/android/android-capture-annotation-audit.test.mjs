// @vitest-environment node

import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

import { auditCaptureAnnotationDatabase } from './android-capture-annotation-audit.mjs';

function databaseFixture(overrides = {}) {
  const rows = {
    capture: {
      content: 'A5 capture task3-proof', current_version_id: 'android#capture', id: 'capture-1',
      last_modified_by_device_id: 'android-device', parent_id: 'special-inbox',
      updated_at: '2026-07-29T01:00:00.000Z', version_device_id: 'android-device'
    },
    cloze: {
      anchor_link: JSON.stringify({ kind: 'cloze', locator: { originalText: 'Cloze target alpha' } }),
      content: 'A5 capture [...]', current_version_id: 'android#cloze', id: 'cloze-1', kind: 'item',
      last_modified_by_device_id: 'android-device', parent_id: 'capture-1', reveal: 'Cloze target alpha',
      updated_at: '2026-07-29T01:01:00.000Z', version_device_id: 'android-device'
    },
    note: {
      anchor_link: JSON.stringify({ kind: 'highlight', locator: { originalText: 'Note target beta' } }),
      content: 'Note target beta\n\nNote: A5 note task3-proof', current_version_id: 'android#note',
      id: 'note-1', kind: 'topic', last_modified_by_device_id: 'android-device', parent_id: 'capture-1',
      updated_at: '2026-07-29T01:02:00.000Z', version_device_id: 'android-device'
    },
    review: { due: '2026-07-29T01:01:00.000Z', state: 0 },
    ...overrides
  };
  let call = 0;
  return { prepare: () => ({ get: () => rows[['capture', 'cloze', 'note', 'review'][call++]] }) };
}

function sqliteFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT, content TEXT, reveal TEXT,
      anchor_link TEXT, current_version_id TEXT, last_modified_by_device_id TEXT,
      updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT, device_id TEXT);
    CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT, state INTEGER);
  `);
  const insertNode = db.prepare(`INSERT INTO nodes (
    id, parent_id, kind, content, reveal, anchor_link, current_version_id,
    last_modified_by_device_id, updated_at, deleted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`);
  insertNode.run('capture-1', 'special-inbox', 'topic',
    'A5 capture task3-proof\n\nCloze target alpha.\n\nNote target beta.', null, null,
    'android#capture', 'android-device', '2026-07-29T01:00:00.000Z');
  insertNode.run('cloze-1', 'capture-1', 'item', 'A5 capture [...]', 'Cloze target alpha',
    JSON.stringify({ kind: 'cloze', locator: { originalText: 'Cloze target alpha' } }),
    'android#cloze', 'android-device', '2026-07-29T01:01:00.000Z');
  insertNode.run('note-1', 'capture-1', 'topic', 'Note target beta\n\nNote: A5 note task3-proof', null,
    JSON.stringify({ kind: 'highlight', locator: { originalText: 'Note target beta' } }),
    'android#note', 'android-device', '2026-07-29T01:02:00.000Z');
  const insertVersion = db.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?)');
  insertVersion.run('android#capture', 'capture-1', 'android-device');
  insertVersion.run('android#cloze', 'cloze-1', 'android-device');
  insertVersion.run('android#note', 'note-1', 'android-device');
  db.prepare('INSERT INTO node_review VALUES (?, ?, ?)')
    .run('cloze-1', '2026-07-29T01:01:00.000Z', 0);
  return db;
}

it('summarizes persisted Capture, Cloze, Note, source anchors, review, and device identity', () => {
  const db = sqliteFixture();
  const summary = auditCaptureAnnotationDatabase(db, 'task3-proof');
  db.close();
  expect(summary).toMatchObject({
    capture: { currentVersionId: 'android#capture', deviceId: 'android-device',
      nodeId: 'capture-1', parentNodeId: 'special-inbox', versionDeviceId: 'android-device' },
    cloze: { hasAnchor: true, hasReview: true, nodeId: 'cloze-1',
      parentNodeId: 'capture-1', reveal: 'Cloze target alpha', sourceText: 'Cloze target alpha' },
    note: { hasAnchor: true, nodeId: 'note-1', parentNodeId: 'capture-1', sourceText: 'Note target beta' },
    resultStatus: 'success', token: 'task3-proof'
  });
});

it('rejects a batch whose Note lacks a stable source anchor', () => {
  expect(() => auditCaptureAnnotationDatabase(databaseFixture({ note: {
    anchor_link: null, content: 'Note target beta\n\nNote: A5 note task3-proof',
    current_version_id: 'android#note', id: 'note-1', kind: 'topic',
    last_modified_by_device_id: 'android-device', parent_id: 'capture-1',
    updated_at: '2026-07-29T01:02:00.000Z', version_device_id: 'android-device'
  } }), 'task3-proof')).toThrow('source anchor is missing');
});

it('rejects a current node version attributed to another device', () => {
  expect(() => auditCaptureAnnotationDatabase(databaseFixture({ cloze: {
    anchor_link: JSON.stringify({ kind: 'cloze', locator: { originalText: 'Cloze target alpha' } }),
    content: 'A5 capture [...]', current_version_id: 'android#cloze', id: 'cloze-1', kind: 'item',
    last_modified_by_device_id: 'android-device', parent_id: 'capture-1', reveal: 'Cloze target alpha',
    updated_at: '2026-07-29T01:01:00.000Z', version_device_id: 'other-device'
  } }), 'task3-proof')).toThrow('missing persisted version or device identity');
});
