// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { softDeleteNodes } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { buildSplitTopicParts } from '../../lib/core/nodes/splitTopicModel.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { splitTopic } from './splitTopicMutation.js';
import { loadSplitTopicPreview } from './splitTopicPreview.js';

let db: DatabaseSync;
let driver: DatabaseDriver;

vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => ({ driver }),
  registerDatabaseConnectionCleanup: vi.fn(),
  registerDatabaseConnectionReady: vi.fn()
}));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

const now = '2026-11-24T00:00:00.000Z';
const original = 'Alpha---Beta';
const options = { delimiter: '---', footerText: '', headerText: '', keepDelimiter: false };

function insertTopic(id: string, content: string, parentId: string | null = null, anchor: string | null = null) {
  db.prepare('INSERT INTO nodes (id, title, content, parent_id, anchor_link, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, id, content, parentId, anchor, now, now);
}

function locator(from: number, originalText: string) {
  return JSON.stringify({ id: 'anchor', kind: 'highlight', locator: { from, to: from + originalText.length, originalText } });
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  let depth = 0;
  const sqlite = {
    prepare: db.prepare.bind(db),
    transaction: (execute: () => unknown) => () => {
      const savepoint = `split_test_${depth++}`;
      db.exec(`SAVEPOINT ${savepoint}`);
      try {
        const result = execute();
        db.exec(`RELEASE ${savepoint}`);
        return result;
      } catch (error) {
        db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
        throw error;
      } finally {
        depth--;
      }
    }
  };
  driver = createBetterSqlite3Driver(sqlite as unknown as Parameters<typeof createBetterSqlite3Driver>[0]);
  for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) db.exec(sql);
  bindParentOrderWriter(driver, { deviceAnchor: 'test-device', libraryPath: '/split-test' });
  db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('host_name', '"test-host"', now);
  insertTopic('source', original);
  insertTopic('highlight', 'Alpha', 'source', locator(0, 'Alpha'));
});

afterEach(() => db.close());

function preview() {
  const result = loadSplitTopicPreview('source');
  if (!result) throw new Error('missing source preview');
  return result;
}

function submit(source: ReturnType<typeof preview>, disposition: 'replace' | 'keep-as-parent') {
  const generatedNodes = buildSplitTopicParts({ ...options, content: source.content }).map((part, index) => ({
    anchorLink: null, content: part.body, createdAt: now, isTitleManual: false,
    kind: 'topic' as const, nodeId: `part-${index}`, parentNodeId: disposition === 'replace' ? source.parentNodeId : 'source',
    position: index + 1, reveal: null, title: part.title, updatedAt: now
  }));
  const args = {
    activeNodeId: 'part-0', generatedNodes, nodeOrder: ['source', 'part-0', 'part-1', 'highlight'],
    sourceNodeId: 'source', sourceParentNodeId: source.parentNodeId, expectedSourceRevision: source.revision
  };
  return splitTopic(disposition === 'replace'
    ? { ...args, disposition, deletedAt: now, splitOptions: options }
    : { ...args, disposition });
}

function persisted() {
  return [
    db.prepare('SELECT * FROM nodes ORDER BY id').all(),
    db.prepare('SELECT * FROM parent_order_sources ORDER BY parent_id, author_id').all(),
    db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all(),
    db.prepare('SELECT * FROM sync_object_state ORDER BY object_type, object_id').all(),
    db.prepare('SELECT * FROM source_disposition_states ORDER BY source_kind, source_scope, original_title').all()
  ];
}

it.each(['replace', 'keep-as-parent'] as const)('refuses to save a %s split when the stored body changes after preview', (disposition) => {
  const shown = preview();
  const current = 'Alpha edited---Beta';
  db.prepare('UPDATE nodes SET content = ? WHERE id = ?').run(current, 'source');
  const before = persisted();

  const result = submit(shown, disposition);

  expect(persisted()).toEqual(before);
  expect(result).toMatchObject({ status: 'source-changed', preview: { content: current } });
  if (!('preview' in result) || !result.preview) throw new Error('missing refreshed preview');

  expect(submit(result.preview, disposition)).toMatchObject({ createdNodeIds: ['part-0', 'part-1'] });
  expect(db.prepare("SELECT content FROM nodes WHERE id = 'part-0'").get()).toEqual({ content: 'Alpha edited' });
  expect(db.prepare("SELECT parent_id FROM nodes WHERE id = 'highlight'").get())
    .toEqual({ parent_id: disposition === 'replace' ? 'part-0' : 'source' });
});

it.each(['insert', 'relocate', 'trash'] as const)('refuses to replace after an annotation %s and can submit the refreshed preview', (edit) => {
  const shown = preview();
  if (edit === 'insert') insertTopic('new-highlight', 'Beta', 'source', locator(8, 'Beta'));
  if (edit === 'relocate') db.prepare('UPDATE nodes SET anchor_link = ? WHERE id = ?').run(locator(8, 'Beta'), 'highlight');
  if (edit === 'trash') db.prepare('UPDATE nodes SET deleted_at = ? WHERE id = ?').run(now, 'highlight');
  const before = persisted();

  const result = submit(shown, 'replace');

  expect(persisted()).toEqual(before);
  expect(result).toMatchObject({ status: 'source-changed', preview: { content: original } });
  if (!('preview' in result) || !result.preview) throw new Error('missing refreshed preview');
  const saved = submit(result.preview, 'replace');
  expect(saved).toMatchObject({ createdNodeIds: ['part-0', 'part-1'], deletedNodeIds: ['source'] });
  expect(db.prepare('SELECT parent_id FROM nodes WHERE id = ?').get(edit === 'insert' ? 'new-highlight' : 'highlight'))
    .toEqual({ parent_id: edit === 'trash' ? 'source' : 'part-1' });
});

it('reports that no preview is available after the source is trashed', () => {
  const shown = preview();
  db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = 'source'").run(now);
  const before = persisted();

  expect(submit(shown, 'replace')).toEqual({ status: 'source-changed', preview: null });
  expect(persisted()).toEqual(before);
});

it.each(['replace', 'keep-as-parent'] as const)('refuses a %s split after an ancestor enters Trash', (disposition) => {
  insertTopic('ancestor', '');
  insertTopic('parent', '', 'ancestor');
  db.prepare("UPDATE nodes SET kind = 'folder' WHERE id IN ('ancestor', 'parent')").run();
  db.prepare("UPDATE nodes SET parent_id = 'parent' WHERE id = 'source'").run();
  const shown = preview();
  softDeleteNodes(driver, { deletedAt: now, nodeIds: ['ancestor'] });
  const before = persisted();

  expect(submit(shown, disposition)).toEqual({ status: 'source-changed', preview: null });
  expect(loadSplitTopicPreview('source')).toBeNull();
  expect(persisted()).toEqual(before);
});
