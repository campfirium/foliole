// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-body-recovery-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { applyAfterVerifiedBackup, applyRecoveryPlan } from '../../scripts/oneoff/readwise-body-recovery-apply.js';
import { buildRecoveryPlan } from '../../scripts/oneoff/readwise-body-recovery-selection.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

const damagedBody = '---\nauthor: Example\ncategory: #articles\n---\n';
const recoveredBody = `${damagedBody}# Article\n\nA unique highlighted sentence.\n\nLong body paragraph.`;
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-body-recovery-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function anchor(originalText: string, from: number) {
  return JSON.stringify({
    id: 'imported-highlight-1', kind: 'highlight', origin: 'imported',
    locator: { from, originalText, to: from + originalText.length }
  });
}

function seedNode(nodeId: string, content: string, parentNodeId: string | null, anchorLink: string | null = null) {
  upsertNodeSnapshot({
    anchorLink: anchorLink ? JSON.parse(anchorLink) : null, content,
    createdAt: '2026-08-01T00:00:00.000Z', isTitleManual: true, kind: 'topic', nodeId,
    parentNodeId, position: 0, reveal: null, title: nodeId, updatedAt: '2026-08-01T00:00:00.000Z'
  });
}

function seedVersion(input: { body: string; nodeId: string; snapshot?: Record<string, unknown>; versionId: string }) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO node_sync_versions
     (version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json, body_text)
     VALUES (?, ?, NULL, 'Test Mac', '2026-08-02T00:00:00.000Z', ?, ?, ?)`,
    [input.versionId, input.nodeId, `hash-${input.versionId}`, JSON.stringify(input.snapshot ?? {}), input.body]
  );
  openDatabaseConnection().driver.execute(
    'UPDATE nodes SET current_version_id = ?, sync_dirty = 0 WHERE id = ?', [input.versionId, input.nodeId]
  );
}

function seedArticle(input: { childHistory?: boolean; childId?: string; nodeId: string }) {
  const driver = openDatabaseConnection().driver;
  seedNode(input.nodeId, recoveredBody, null);
  seedVersion({ body: recoveredBody, nodeId: input.nodeId, versionId: `version-${input.nodeId}` });
  driver.execute(
    `INSERT INTO import_sources
     (source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
      last_imported_at, last_content_fingerprint, latest_node_id)
     VALUES (?, 'desktop_text_file', 'markdown', ?, ?, '2026-08-01', '2026-08-01', 'content', ?)`,
    [`source-${input.nodeId}`, `${input.nodeId}.md`, `/Readwise/Full Document Contents/Articles/${input.nodeId}.md`, input.nodeId]
  );
  const childId = input.childId ?? `child-${input.nodeId}`;
  const text = 'A unique highlighted sentence.';
  seedNode(childId, text, input.nodeId, anchor(text, damagedBody.length));
  if (input.childHistory !== false) {
    const historical = anchor(text, recoveredBody.indexOf(text));
    seedVersion({ body: text, nodeId: childId, snapshot: { anchor_link: historical }, versionId: `version-${childId}` });
  }
  writeNodeBody({ content: damagedBody, driver, nodeId: input.nodeId, title: input.nodeId,
    updatedAt: '2026-08-25T00:00:00.000Z' });
  return childId;
}

function readResolvedBody(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<{ body: string }>(
    `SELECT CAST(cbd.data AS TEXT) AS body FROM nodes n
     JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`, [nodeId]
  )?.body;
}

it('selects historical locators, restores through formal owners, and becomes idempotent', () => {
  const childId = seedArticle({ childHistory: true, nodeId: 'article-1' });
  const driver = openDatabaseConnection().driver;
  const plan = buildRecoveryPlan(driver, '2026-09-04T00:00:00.000Z');
  expect(plan.apply).toHaveLength(1);
  expect(plan.apply[0]?.anchors).toMatchObject([{ childId, source: 'historical_snapshot' }]);

  applyRecoveryPlan({ driver, hostName: 'Test Mac', now: '2026-09-04T00:00:01.000Z', plan });

  expect(readResolvedBody('article-1')).toBe(recoveredBody);
  const stored = driver.queryOne<{ anchor_link: string }>('SELECT anchor_link FROM nodes WHERE id = ?', [childId]);
  const locator = JSON.parse(stored?.anchor_link ?? '{}').locator;
  expect(recoveredBody.slice(locator.from, locator.to)).toBe(locator.originalText);
  expect(buildRecoveryPlan(driver).apply).toHaveLength(0);
});

it('uses unique originalText only when no historical locator snapshot exists', () => {
  seedArticle({ childHistory: false, nodeId: 'article-unique' });
  const plan = buildRecoveryPlan(openDatabaseConnection().driver);
  expect(plan.apply[0]?.anchors).toMatchObject([{ source: 'unique_original_text', sourceVersionId: null }]);
});

it('reports unavailable and non-frontmatter-only records without changing them', () => {
  seedArticle({ nodeId: 'article-unavailable' });
  const driver = openDatabaseConnection().driver;
  const hash = driver.queryOne<{ body_blob_hash: string }>('SELECT body_blob_hash FROM nodes WHERE id = ?', ['article-unavailable']);
  driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash?.body_blob_hash ?? '']);
  seedNode('article-manual', 'Current meaningful body', null);
  seedVersion({ body: 'A much longer meaningful historical body', nodeId: 'article-manual', versionId: 'version-manual' });
  driver.execute(
    `INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name, source_locator,
     first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id)
     VALUES ('source-manual', 'desktop_text_file', 'markdown', 'manual.md',
     '/Full Document Contents/Articles/manual.md', '2026-08-01', '2026-08-01', 'content', 'article-manual')`
  );
  const plan = buildRecoveryPlan(driver);
  expect(plan.manualReview.map((item) => item.reason)).toEqual(expect.arrayContaining([
    'current_body_unavailable', 'non_frontmatter_only_history_is_longer'
  ]));
});

it('rolls back every recovered record after an in-transaction failure', () => {
  seedArticle({ nodeId: 'article-rollback' });
  const driver = openDatabaseConnection().driver;
  const plan = buildRecoveryPlan(driver);
  expect(() => applyRecoveryPlan({ driver, hostName: 'Test Mac', now: '2026-09-04T00:00:01.000Z', plan,
    afterCandidate: () => { throw new Error('injected failure'); } })).toThrow('injected failure');
  expect(readResolvedBody('article-rollback')).toBe(damagedBody);
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM node_sync_versions WHERE object_id = 'article-rollback'"
  )).toEqual({ count: 1 });
});

it('never starts apply when verified backup creation fails', async () => {
  const apply = vi.fn();
  await expect(applyAfterVerifiedBackup({ apply, createVerifiedBackup: async () => {
    throw new Error('backup integrity failed');
  } })).rejects.toThrow('backup integrity failed');
  expect(apply).not.toHaveBeenCalled();
});
