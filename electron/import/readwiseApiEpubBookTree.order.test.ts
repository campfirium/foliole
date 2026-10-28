// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { placeUnlocatedChildHighlightsLast } from '../../lib/core/database/importPipelineHighlightNodes.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { rewriteExistingNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';
import { stableReadwiseEpubNodeId } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { buildReadwiseApiEpubBodyOverwrite } from './readwiseApiEpubBodyRepair.js';
import { persistReadwiseApiEpubBookNodes } from './readwiseApiEpubBookTree.js';
import { placeReadwiseUnlocatedNodeLast } from './readwiseBookUnlocated.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-order-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  const driver = openDatabaseConnection().driver;
  for (const [nodeId, title] of [['root', 'Book'], ['sibling', 'Sibling']] as const) {
    upsertNodeSnapshot(driver, {
      anchorLink: null, content: '', createdAt: '2026-09-13T00:00:00.000Z', hideTitleHeading: false,
      isTitleManual: true, kind: 'topic', nodeId, parentNodeId: null, position: null, reveal: null,
      title, updatedAt: '2026-09-13T00:00:00.000Z'
    });
  }
  rewriteExistingNodeOrder(driver, ['root', 'sibling']);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps rebuilt EPUB topics in the source order directly after their root', () => {
  persist(['first', 'second']);
  expect(readOrderedTitles()).toEqual(['Book', 'first', 'second', 'Sibling']);

  persist(['second', 'first']);
  expect(readOrderedTitles()).toEqual(['Book', 'second', 'first', 'Sibling']);
});

it('overwrites bodies from API HTML without changing the existing node scope', () => {
  const childId = stableReadwiseEpubNodeId('connection', 'document', 'section');
  const before = new Map([
    ['root', { content: '# Book\n\n![Book cover](asset://cover.jpg)\n\nOld root', id: 'root', title: 'Book' }],
    [childId, { content: 'Old section', id: childId, title: 'Section' }]
  ]);
  const desired = buildReadwiseApiEpubBodyOverwrite({
    connectionRef: 'connection', documentId: 'document', nodeId: 'root', title: 'Book'
  }, before, {
    accounting: {
      conversionDroppedCount: 0, localizedBodyCount: 0, sourceBodyCount: 0,
      treeBodyCount: 0, unavailableBodyCount: 0
    },
    degradedReason: null,
    rootAttachmentIds: [],
    rootBody: 'New root from API HTML',
    sections: [{
      attachmentIds: [], content: 'New section from API HTML', headingLevel: 1,
      markerKey: 'section', title: 'Section'
    }]
  });

  expect(desired.map((item) => item.nodeId)).toEqual(['root', childId]);
  expect(desired.map((item) => item.content)).toEqual([
    '# Book\n\n![Book cover](asset://cover.jpg)\n\nNew root from API HTML',
    'New section from API HTML'
  ]);
});

function persist(titles: string[]) {
  persistReadwiseApiEpubBookNodes({
    connectionRef: 'connection', documentId: 'document', importedAt: new Date().toISOString(),
    nodes: titles.map((title) => ({ attachmentIds: [], content: title, key: title, parentKey: null, title })),
    rootNodeId: 'root'
  });
}

function readOrderedTitles() {
  const driver = openDatabaseConnection().driver;
  return loadDerivedNodeOrder(driver).flatMap((id) => {
    const row = driver.queryOne<{ title: string }>(
      'SELECT title FROM nodes WHERE id = ? AND deleted_at IS NULL', [id]
    );
    return row && !id.startsWith('special-') ? [row.title] : [];
  });
}

for (const size of [100, 1000]) {
  it.each(['chapters', 'unlocated group', 'unlocated excerpts'] as const)(
    `only reads affected siblings when ordering %s among ${size} unrelated nodes`, (operation) => {
      const driver = openDatabaseConnection().driver;
      for (const [id, parent] of [['a', 'root'], ['b', 'root'], ['hidden', 'root'],
        ...Array.from({ length: size }, (_, index) => [`unrelated-${index}`, 'sibling'])]) {
        upsertNodeSnapshot(driver, { anchorLink: null, content: id!, createdAt: '2026-09-13T00:00:00.000Z',
          hideTitleHeading: false, isTitleManual: true, kind: 'topic', nodeId: id!, parentNodeId: parent!,
          position: null, reveal: null, title: id!, updatedAt: '2026-09-13T00:00:00.000Z' });
      }
      rewriteExistingNodeOrder(driver, ['root', 'a', 'hidden', 'b', 'sibling',
        ...Array.from({ length: size }, (_, index) => `unrelated-${index}`)]);
      driver.execute("UPDATE nodes SET deleted_at='gone' WHERE id='hidden'");
      loadDerivedNodeOrder(driver);
      const otherOrder = driver.queryOne("SELECT * FROM parent_child_order WHERE parent_id='sibling'");
      const original = driver.queryAll.bind(driver);
      let unrelatedReads = 0;
      const reads = vi.spyOn(driver, 'queryAll').mockImplementation((sql, params) => {
        const rows = original(sql, params);
        unrelatedReads += rows.filter(row => typeof row.id === 'string' && row.id.startsWith('unrelated-')).length;
        return rows;
      });
      try {
        for (let repeat = 0; repeat < 2; repeat++) {
          if (operation === 'chapters') persist(['second', 'first']);
          else if (operation === 'unlocated group') placeReadwiseUnlocatedNodeLast(driver, 'root', 'a');
          else placeUnlocatedChildHighlightsLast(driver, 'root', ['a']);
        }
      } finally { reads.mockRestore(); }
      const order = loadDerivedNodeOrder(driver);
      const childTitles = order.flatMap(id => {
        const row = driver.queryOne<{ title: string }>(
          "SELECT title FROM nodes WHERE id=? AND parent_id='root' AND deleted_at IS NULL", [id]);
        return row ? [row.title] : [];
      });
      expect(childTitles).toEqual(operation === 'chapters' ? ['second', 'first', 'a', 'b'] : ['b', 'a']);
      const stored = driver.queryOne<{ child_ids_json: string }>(
        "SELECT child_ids_json FROM parent_child_order WHERE parent_id='root'");
      expect(JSON.parse(stored!.child_ids_json)[1]).toBe('hidden');
      expect(driver.queryOne("SELECT * FROM parent_child_order WHERE parent_id='sibling'")).toEqual(otherOrder);
      expect(unrelatedReads).toBe(0);
    });
}

it('keeps nested chapter order and places retained children after replacement chapters', () => {
  const driver = openDatabaseConnection().driver;
  const chapterId = stableReadwiseEpubNodeId('connection', 'document', 'chapter');
  const retainedId = stableReadwiseEpubNodeId('connection', 'document', 'retained');
  const obsoleteId = stableReadwiseEpubNodeId('connection', 'document', 'obsolete');
  const run = (keys: Array<[string, string | null]>) => persistReadwiseApiEpubBookNodes({
    connectionRef: 'connection', documentId: 'document', importedAt: '2026-10-28T00:00:00.000Z',
    nodes: keys.map(([key, parentKey]) => ({ key, parentKey, title: key, content: key, attachmentIds: [] })),
    rootNodeId: 'root'
  });
  run([['chapter', null], ['retained', 'chapter'], ['obsolete', null]]);
  upsertNodeSnapshot(driver, { anchorLink: null, content: 'Manual', createdAt: '2026-09-13T00:00:00.000Z',
    hideTitleHeading: false, isTitleManual: true, kind: 'topic', nodeId: 'manual', parentNodeId: obsoleteId,
    position: null, reveal: null, title: 'Manual', updatedAt: '2026-09-13T00:00:00.000Z' });
  run([['chapter', null], ['new', 'chapter'], ['retained', 'chapter'], ['last', null]]);
  expect(readOrderedTitles()).toEqual(['Book', 'chapter', 'new', 'retained', 'last', 'Manual', 'Sibling']);
  expect(driver.queryOne('SELECT parent_id FROM nodes WHERE id=?', [retainedId])).toEqual({ parent_id: chapterId });
  expect(driver.queryOne("SELECT parent_id FROM nodes WHERE id='manual'")).toEqual({ parent_id: 'root' });
  closeDatabaseConnection();
  initializeDatabaseConnection(openDatabaseConnection());
  expect(readOrderedTitles()).toEqual(['Book', 'chapter', 'new', 'retained', 'last', 'Manual', 'Sibling']);
});
