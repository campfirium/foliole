// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir, app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { placeReadwiseApiEpubAnnotations } from './readwiseApiEpubAnnotationPlacement.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-overlap-'));
  appDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});


function seedBook(body = 'Before. Exact excerpt. Another passage. After.') {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
     VALUES ('book',NULL,'topic','Book',0,'','old','old'),
       ('chapter','book','topic','Chapter',0,?,'old','old')`, [body]
  );
  return body;
}

function place(body: string, texts: string[], policy: 'first' | 'unique' = 'unique') {
  return placeReadwiseApiEpubAnnotations({
    annotations: texts.map((content, index) => ({
      content, contentHash: String(index), kind: 'highlight', locatorText: content,
      parentRemoteId: 'document-1', remoteId: String(index), updatedAt: 'old'
    })),
    annotationStates: [], bodies: [{ content: body, id: 'chapter' }],
    connectionRef: 'connection', documentId: 'document-1', importedAt: 'now',
    relocationPolicy: policy, rootNodeId: 'book'
  });
}

function highlights() {
  return openDatabaseConnection().driver.queryAll<{
    anchor_link: string | null; content: string; id: string; parent_title: string;
  }>(`SELECT child.id,child.content,child.anchor_link,parent.title parent_title FROM nodes child
      JOIN nodes parent ON parent.id=child.parent_id
      WHERE child.id LIKE 'node-readwise-%' AND child.id NOT LIKE 'node-readwise-unlocated-%'
      ORDER BY child.id`);
}

it.each(['unique', 'first'] as const)('routes overlap rejection to the final dedicated container (%s)', (policy) => {
  const body = seedBook();
  expect(place(body, ['Exact excerpt.', 'Exact excerpt.'], policy)).toBe(2);
  const rows = highlights();
  expect(rows).toHaveLength(2);
  expect(rows.filter((row) => row.anchor_link !== null).map((row) => row.parent_title)).toEqual(['Chapter']);
  expect(rows.filter((row) => row.anchor_link === null).map((row) => row.parent_title)).toEqual(['※']);
  expect(rows.map((row) => row.content)).toEqual(['Exact excerpt.', 'Exact excerpt.']);
  expect(openDatabaseConnection().driver.queryOne<{ title: string }>(
    `SELECT n.title FROM nodes n JOIN node_order o ON o.node_id=n.id
     WHERE n.parent_id='book' ORDER BY o.position DESC LIMIT 1`
  )).toEqual({ title: '※' });
});

it('keeps distinct matches anchored without creating a fallback container', () => {
  const body = seedBook();
  place(body, ['Exact excerpt.', 'Another passage.']);
  expect(highlights()).toHaveLength(2);
  expect(highlights().every((row) => row.parent_title === 'Chapter' && row.anchor_link !== null)).toBe(true);
  expect(openDatabaseConnection().driver.queryOne(
    "SELECT id FROM nodes WHERE title='※'"
  )).toBeUndefined();
});

it('does not guess ambiguous or absent matches and does not reuse ordinary same-title nodes', () => {
  const body = seedBook('Repeated text. Repeated text. Unique excerpt.');
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('ordinary','book','topic','※',1,'User content','old','old')`);
  place(body, ['Repeated text.', 'Missing text.', 'Unique excerpt.', 'Unique excerpt.']);
  const rows = highlights();
  expect(rows.filter((row) => row.anchor_link === null)).toHaveLength(3);
  expect(rows.filter((row) => row.anchor_link === null).every((row) => row.parent_title === '※')).toBe(true);
  expect(driver.queryOne("SELECT COUNT(*) count FROM nodes WHERE parent_id='ordinary'")).toEqual({ count: 0 });
  expect(driver.queryOne("SELECT content FROM nodes WHERE id='chapter'")).toEqual({ content: body });
});

it('preserves edited content and identity when placement is repeated', () => {
  const body = seedBook();
  place(body, ['Exact excerpt.', 'Exact excerpt.']);
  const before = highlights();
  const rejected = before.find((row) => row.anchor_link === null)!;
  openDatabaseConnection().driver.execute(
    "UPDATE nodes SET content='Local edited note',title='Local title',is_title_manual=1 WHERE id=?", [rejected.id]
  );
  place(body, ['Exact excerpt.', 'Exact excerpt.']);
  expect(highlights().map((row) => row.id)).toEqual(before.map((row) => row.id));
  expect(highlights().find((row) => row.id === rejected.id)).toMatchObject({
    anchor_link: null, content: 'Local edited note', parent_title: '※'
  });
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT title,is_title_manual FROM nodes WHERE id=?', [rejected.id]
  )).toEqual({ is_title_manual: 1, title: 'Local title' });
});
