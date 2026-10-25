// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('./readwiseApiConnectionState.js', () => ({ isStoredReadwiseApiConnectionReady: () => true }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { stableReadwiseAnnotationNodeId, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { mergeRetainedReadwiseAnnotations } from './readwiseOriginalEpubAnnotations.js';
import { commitReadwiseSourceResync } from './readwiseSourceResyncCommit.js';
import { captureReadwiseSourceResyncSnapshot, loadReadwiseSourceResyncTarget } from './readwiseSourceResyncTarget.js';

const at = '2026-10-20T00:00:00.000Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reimport-learning-'));
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('test');
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { force: true, recursive: true });
});

function document(category: 'article' | 'epub', body: string, ids: string[], chapter = 'chapter'): PreparedReadwiseApiDocument {
  return { annotations: ids.map(id => ({ content: id, contentHash: id, kind: 'highlight', locatorText: id,
    parentRemoteId: 'document', remoteId: id, updatedAt: at })),
  body, category, coverImageUrl: null, degradedReason: null, id: 'document',
  metadata: { author: null, category, readerUrl: null, sourceUrl: null, title: 'Source' },
  title: 'Source', unmatchedAnnotationCount: 0, updatedAt: at,
  ...(category === 'epub' ? { epubStructure: { degradedReason: null, imageCount: 0, markerCount: 1,
    rootBody: '', sections: [{ content: body, headingLevel: 1, markerKey: chapter, title: chapter }] } } : {}) };
}

function seed(category: 'article' | 'epub') {
  const connectionRef = ensureReadwiseRemoteSource(false, at).connectionRef;
  materializeReadwiseApiDocument({ config: createDefaultReadwiseReaderConfig(), connectionRef,
    destination: 'inbox', importedAt: at, document: document(category, 'kept omitted vanished', ['kept', 'omitted', 'vanished']) });
  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>('SELECT latest_node_id FROM import_sources')!;
  const ids = ['kept', 'omitted', 'vanished'].map(id => stableReadwiseAnnotationNodeId(connectionRef, id));
  for (const id of ids) {
    writeNodeBody({ driver, nodeId: id, content: `User content ${id}`, title: 'My title', updatedAt: at });
    driver.execute("UPDATE nodes SET title=?,kind=?,reveal=?,is_title_manual=1,anchor_link=json_set(anchor_link,'$.kind','cloze') WHERE id=?", ['My title', 'item', 'My answer', id]);
    driver.execute('INSERT INTO node_review (node_id,due,reps,stability,difficulty) VALUES (?,?,3,12,4)', [id, '2026-11-01']);
    driver.execute(`INSERT INTO review_log (id,op_id,host_name,node_id,grade,scheduler_version,reviewed_at,
      due_before,due_after,stability_before,stability_after,difficulty_before,difficulty_after)
      VALUES (?,?, 'test',?,3,'test',?,'2026-10-20','2026-11-01',1,12,3,4)`, [`log-${id}`, `op-${id}`, id, at]);
  }
  return { connectionRef, ids, rootId: source.latest_node_id };
}

function preserved() {
  const driver = openDatabaseConnection().driver;
  return { nodes: driver.queryAll(`SELECT id,content,title,reveal,kind,created_at FROM nodes WHERE kind='item' ORDER BY id`),
    reviews: driver.queryAll('SELECT * FROM node_review ORDER BY node_id'),
    logs: driver.queryAll('SELECT * FROM review_log ORDER BY op_id') };
}

it.each(['article', 'epub'] as const)('preserves %s user excerpts and learning while relocating, omitting and repeating', category => {
  const seeded = seed(category);
  const before = preserved();
  for (let i = 0; i < 2; i += 1) {
    const target = loadReadwiseSourceResyncTarget(seeded.rootId)!;
    const next = document(category, 'Updated kept omitted new', ['kept', 'vanished', 'new'], 'new-chapter');
    next.annotations = mergeRetainedReadwiseAnnotations(target, next.annotations, { unlocateMissing: true });
    commitReadwiseSourceResync({ candidate: { cover: null, document: next, images: null },
      expectedSnapshot: captureReadwiseSourceResyncSnapshot(target), importedAt: `2026-10-2${i + 1}T00:00:00.000Z`, target });
    expect(preserved()).toEqual(before);
    const driver = openDatabaseConnection().driver;
    const keptAnchor = driver.queryOne<{ anchor_link: string }>('SELECT anchor_link FROM nodes WHERE id=?', [seeded.ids[0]!])!;
    expect(JSON.parse(keptAnchor.anchor_link)).toMatchObject({ kind: 'cloze' });
    expect(driver.queryOne<{ anchor_link: string }>('SELECT anchor_link FROM nodes WHERE id=?', [seeded.ids[0]!])?.anchor_link)
      .toContain('locator');
    for (const id of seeded.ids.slice(1)) {
      const node = driver.queryOne<{ anchor_link: string | null; parent_id: string; deleted_at: string | null }>(
        'SELECT anchor_link,parent_id,deleted_at FROM nodes WHERE id=?', [id])!;
      expect(node.deleted_at).toBeNull();
      expect(node.anchor_link ?? '').not.toContain('locator');
      if (category === 'epub') {
        expect(driver.queryOne('SELECT title,parent_id FROM nodes WHERE id=?', [node.parent_id]))
          .toEqual({ title: '※', parent_id: seeded.rootId });
        const order = loadDerivedNodeOrder(driver);
        const siblings = driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE parent_id=? AND deleted_at IS NULL', [seeded.rootId]);
        expect(order.filter(value => siblings.some(row => row.id === value)).at(-1)).toBe(node.parent_id);
      } else {
        expect(node.parent_id).toBe(seeded.rootId);
        const order = loadDerivedNodeOrder(driver);
        expect(order.indexOf(id)).toBeGreaterThan(order.indexOf(stableReadwiseAnnotationNodeId(seeded.connectionRef, 'new')));
      }
    }
    expect(driver.queryOne('SELECT content FROM nodes WHERE id=?', [stableReadwiseAnnotationNodeId(seeded.connectionRef, 'new')]))
      .toEqual({ content: 'new' });
    expect(driver.queryAll('PRAGMA foreign_key_check')).toEqual([]);
  }
});

it.each([
  { category: 'epub', edited: false }, { category: 'epub', edited: true },
  { category: 'article', edited: false }, { category: 'article', edited: true }
] satisfies Array<{ category: 'article' | 'epub'; edited: boolean }>)('keeps an omitted $category excerpt independent when its source text remains (edited=$edited)', ({ category, edited }) => {
  const seeded = seed(category);
  const driver = openDatabaseConnection().driver;
  if (!edited) writeNodeBody({ driver, nodeId: seeded.ids[1]!, content: 'omitted', title: 'My title', updatedAt: at });
  const before = preserved();
  for (let i = 0; i < 2; i += 1) {
    const target = loadReadwiseSourceResyncTarget(seeded.rootId)!;
    const next = document(category, 'Updated kept omitted new', ['kept', 'new'], 'new-chapter');
    next.annotations = mergeRetainedReadwiseAnnotations(target, next.annotations, { unlocateMissing: true });
    commitReadwiseSourceResync({ candidate: { cover: null, document: next, images: null },
      expectedSnapshot: captureReadwiseSourceResyncSnapshot(target), importedAt: `2026-10-2${i + 3}T00:00:00.000Z`, target });
    expect(preserved()).toEqual(before);
    const omitted = driver.queryOne<{ anchor_link: string | null; parent_id: string }>(
      'SELECT anchor_link,parent_id FROM nodes WHERE id=?', [seeded.ids[1]!])!;
    expect(omitted.anchor_link ?? '').not.toContain('locator');
    if (category === 'epub') expect(driver.queryOne('SELECT title,parent_id FROM nodes WHERE id=?', [omitted.parent_id]))
      .toEqual({ title: '※', parent_id: seeded.rootId });
    else expect(omitted.parent_id).toBe(seeded.rootId);
    const kept = driver.queryOne<{ anchor_link: string }>('SELECT anchor_link FROM nodes WHERE id=?', [seeded.ids[0]!])!;
    expect(JSON.parse(kept.anchor_link)).toMatchObject({ locator: { originalText: 'kept' } });
  }
});
