// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-anchor-repair-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { applyAnchorRepairPlan } from '../../scripts/oneoff/readwise-anchor-repair-apply.js';
import { buildAnchorRepairPlan } from '../../scripts/oneoff/readwise-anchor-repair-selection.js';
import type { BodyRecoveryReceipt } from '../../scripts/oneoff/readwise-anchor-repair-types.js';
import { applyAfterVerifiedBackup } from '../../scripts/oneoff/readwise-body-recovery-apply.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

const recoveredAt = '2026-09-04T02:34:30.049Z';
const repairedAt = '2026-09-04T04:00:00.000Z';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-anchor-repair-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function anchor(text: string, from: number) {
  return JSON.stringify({ id: crypto.randomUUID(), kind: 'highlight', origin: 'imported',
    locator: { from, originalText: text, to: from + text.length } });
}

function seedNode(id: string, content: string, parentId: string | null, anchorLink: string | null) {
  upsertNodeSnapshot({ anchorLink: anchorLink ? JSON.parse(anchorLink) : null, content,
    createdAt: '2026-08-01T00:00:00.000Z', isTitleManual: true, kind: 'topic', nodeId: id,
    parentNodeId: parentId, position: 0, reveal: null, title: id, updatedAt: recoveredAt });
}

function seedRecovered(input: { bodyText?: string; id: string; visibleText: string }) {
  const driver = openDatabaseConnection().driver;
  const body = input.bodyText ?? `---\nsummary: ${input.visibleText}\n---\n\n# Article\n\n${input.visibleText}\n`;
  seedNode(input.id, body, null, null);
  const written = writeNodeBody({ content: body, driver, nodeId: input.id, title: input.id, updatedAt: recoveredAt });
  driver.execute('UPDATE nodes SET sync_dirty = 1 WHERE id = ?', [input.id]);
  const parentVersionId = flushNodeSyncVersionWithDriver(driver, input.id, 'Test Mac', recoveredAt);
  if (!parentVersionId) throw new Error('parent version missing');
  const childId = `child-${input.id}`;
  const oldAnchor = anchor(input.visibleText, body.indexOf(input.visibleText));
  seedNode(childId, input.visibleText, input.id, oldAnchor);
  driver.execute(
    `UPDATE nodes SET anchor_resolution_status = 'resolved', anchor_source_version_id = 'old-child-version',
     sync_dirty = 1, updated_at = ? WHERE id = ?`, [recoveredAt, childId]
  );
  const childVersionId = flushNodeSyncVersionWithDriver(driver, childId, 'Test Mac', recoveredAt);
  if (!childVersionId) throw new Error('child version missing');
  const receipt: BodyRecoveryReceipt = {
    databasePath: '/test/foliole.db', mode: 'apply',
    plan: { apply: [{ anchors: [{ anchorLink: oldAnchor, childId }], nodeId: input.id, recoveryContent: body }],
      generatedAt: recoveredAt, planHash: 'source-plan' },
    result: { applied: { recovered: [{ bodyHash: written, nodeId: input.id, versionId: parentVersionId }] } }
  };
  return { body, childId, childVersionId, parentVersionId, receipt };
}

function applyPlan(receipt: BodyRecoveryReceipt) {
  const driver = openDatabaseConnection().driver;
  const plan = buildAnchorRepairPlan(driver, receipt, repairedAt);
  const result = applyAnchorRepairPlan({ driver, hostName: 'Test Mac', now: repairedAt, plan });
  return { plan, result };
}

it('relocates a historical frontmatter locator to its unique visible-body match and becomes idempotent', () => {
  const seeded = seedRecovered({ id: 'article-visible', visibleText: 'Target sentence.' });
  const { plan, result } = applyPlan(seeded.receipt);
  expect(plan.apply).toHaveLength(1);
  expect(plan.apply[0]?.newRanges?.[0]?.from).toBe(seeded.body.lastIndexOf('Target sentence.'));
  expect(result.changed).toHaveLength(1);
  const row = openDatabaseConnection().driver.queryOne<{
    anchor_link: string; anchor_resolution_status: string; anchor_source_version_id: string;
  }>('SELECT anchor_link, anchor_resolution_status, anchor_source_version_id FROM nodes WHERE id = ?', [seeded.childId]);
  expect(row?.anchor_resolution_status).toBe('resolved');
  expect(row?.anchor_source_version_id).toBe(seeded.parentVersionId);
  expect(JSON.parse(row?.anchor_link ?? '{}').locator.from).toBe(seeded.body.lastIndexOf('Target sentence.'));
  const second = buildAnchorRepairPlan(openDatabaseConnection().driver, seeded.receipt);
  expect({ apply: second.apply.length, unmap: second.unmap.length }).toEqual({ apply: 0, unmap: 0 });
});

it('marks a frontmatter-only match unmapped without changing the highlight content or locator', () => {
  const seeded = seedRecovered({ bodyText: '---\nsummary: Metadata only.\n---\n\nVisible body.\n',
    id: 'article-missing', visibleText: 'Metadata only.' });
  const before = openDatabaseConnection().driver.queryOne<{ anchor_link: string; content: string }>(
    'SELECT anchor_link, content FROM nodes WHERE id = ?', [seeded.childId]
  );
  const { plan } = applyPlan(seeded.receipt);
  expect(plan.unmap).toHaveLength(1);
  const after = openDatabaseConnection().driver.queryOne<{
    anchor_link: string; anchor_resolution_status: string; content: string;
  }>('SELECT anchor_link, anchor_resolution_status, content FROM nodes WHERE id = ?', [seeded.childId]);
  expect(after).toMatchObject({ anchor_link: before?.anchor_link, anchor_resolution_status: 'unmapped_missing',
    content: before?.content });
  const second = buildAnchorRepairPlan(openDatabaseConnection().driver, seeded.receipt, repairedAt,
    { trustCurrentBaseline: true });
  expect({ apply: second.apply.length, unmap: second.unmap.length }).toEqual({ apply: 0, unmap: 0 });
});

it('uses the shared imported-body boundary for generated H1 locators', () => {
  const titleOnly = seedRecovered({ bodyText: '# Heading target\n\nVisible body.\n',
    id: 'article-heading-only', visibleText: 'Heading target' });
  const firstPlan = applyPlan(titleOnly.receipt).plan;
  expect(firstPlan.unmap).toMatchObject([{ childId: titleOnly.childId, nextStatus: 'unmapped_missing' }]);

  const titleAndBody = seedRecovered({ bodyText: '# Shared target\n\nShared target appears in body.\n',
    id: 'article-heading-and-body', visibleText: 'Shared target' });
  const secondPlan = applyPlan(titleAndBody.receipt).plan;
  expect(secondPlan.apply[0]?.newRanges?.[0]?.from).toBe(titleAndBody.body.lastIndexOf('Shared target'));
});

it('marks multiple visible matches ambiguous and never scans nodes outside the source receipt', () => {
  const seeded = seedRecovered({ bodyText: [
    '---', 'summary: Repeated text.', '---', '', 'Repeated text.', '', 'Repeated text.'
  ].join('\n'), id: 'article-ambiguous', visibleText: 'Repeated text.' });
  seedNode('outside-receipt', 'Untouched', null, null);
  const { plan } = applyPlan(seeded.receipt);
  expect(plan.unmap).toMatchObject([{ childId: seeded.childId, nextStatus: 'unmapped_ambiguous' }]);
  expect(openDatabaseConnection().driver.queryOne<{ content: string }>(
    'SELECT content FROM nodes WHERE id = ?', ['outside-receipt']
  )).toEqual({ content: 'Untouched' });
});

it('fails closed when a child changed after the T175-3 receipt', () => {
  const seeded = seedRecovered({ id: 'article-drift', visibleText: 'Target sentence.' });
  openDatabaseConnection().driver.execute('UPDATE nodes SET updated_at = ?, sync_dirty = 1 WHERE id = ?',
    ['2026-09-04T03:00:00.000Z', seeded.childId]);
  flushNodeSyncVersionWithDriver(openDatabaseConnection().driver, seeded.childId, 'Test Mac', '2026-09-04T03:00:00.000Z');
  const plan = buildAnchorRepairPlan(openDatabaseConnection().driver, seeded.receipt);
  expect(plan.apply).toHaveLength(0);
  expect(plan.manualReview).toMatchObject([{ reason: 'child_changed_after_t175_3' }]);
});

it('locks a later current baseline for the scoped T175-6 correction', () => {
  const seeded = seedRecovered({ id: 'article-current-baseline', visibleText: 'Target sentence.' });
  const driver = openDatabaseConnection().driver;
  driver.execute('UPDATE nodes SET updated_at = ?, sync_dirty = 1 WHERE id = ?',
    ['2026-09-04T03:00:00.000Z', seeded.childId]);
  flushNodeSyncVersionWithDriver(driver, seeded.childId, 'Test Mac', '2026-09-04T03:00:00.000Z');
  const plan = buildAnchorRepairPlan(driver, seeded.receipt, repairedAt, { trustCurrentBaseline: true });
  expect(plan.apply).toHaveLength(1);
  expect(plan.manualReview).toHaveLength(0);
  driver.execute('UPDATE nodes SET anchor_resolution_status = ? WHERE id = ?', ['unmapped_missing', seeded.childId]);
  expect(() => applyAnchorRepairPlan({ driver, hostName: 'Test Mac', now: repairedAt, plan }))
    .toThrow(`anchor_repair_input_drift:${seeded.childId}`);
});

it('rolls back locator and version when an in-transaction mutation fails', () => {
  const seeded = seedRecovered({ id: 'article-rollback', visibleText: 'Target sentence.' });
  const driver = openDatabaseConnection().driver;
  const plan = buildAnchorRepairPlan(driver, seeded.receipt);
  expect(() => applyAnchorRepairPlan({ afterMutation: () => { throw new Error('injected failure'); },
    driver, hostName: 'Test Mac', now: repairedAt, plan })).toThrow('injected failure');
  expect(driver.queryOne<{ current_version_id: string }>('SELECT current_version_id FROM nodes WHERE id = ?',
    [seeded.childId])).toEqual({ current_version_id: seeded.childVersionId });
});

it('never starts apply when verified backup creation fails', async () => {
  const apply = vi.fn();
  await expect(applyAfterVerifiedBackup({ apply, createVerifiedBackup: async () => {
    throw new Error('backup integrity failed');
  } })).rejects.toThrow('backup integrity failed');
  expect(apply).not.toHaveBeenCalled();
});
