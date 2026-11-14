// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { expect, it, vi } from 'vitest';

import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { resetNodeReviewState } from '../../lib/core/database/reviewMutations.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot.js';
import { makeSuperMemoPreviewReport } from '../../lib/core/import/superMemoPreviewReport.js';
import { readSuperMemoXmlDraft } from '../../lib/core/import/superMemoXmlDraft.js';
import { collectReviewQueueCandidates } from '../../lib/core/review/queue/reviewQueuePlannerCandidates.js';
import { createReviewQueueTimeInput } from '../../lib/core/review/queue/reviewQueueTimeInput.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { publishAttachmentLibraryPathSnapshot, clearAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { authorizeSelectedImportDirectoryPath, resetImportPathAuthorizationForTests } from '../ipc/importPathAuthorization.js';
import { handleSuperMemoImportCommand } from '../ipc/superMemoImportCommands.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { sendReviews } from './reviewProjection.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));


function dueCards(driver: ReturnType<typeof createBetterSqlite3Driver>, now: string) {
  const snapshot = loadWorkspaceSnapshot(driver)!;
  return collectReviewQueueCandidates({ ...snapshot, trashedNodeIds: new Set(snapshot.trashedNodeIds),
    includeScheduled: false, time: createReviewQueueTimeInput(0, 0), now }).fsrsCandidates.map(node => node.id);
}

async function verifyDismissedSync(source: ReturnType<Awaited<ReturnType<typeof restoreFixture>>['peer']>,
  target: typeof source, nodeId: string, now: string) {
  const driver = createBetterSqlite3Driver(source.sqlite);
  const later = new Date(Date.parse(now) + 60_000).toISOString();
  const ancestors = source.sqlite.prepare(`WITH RECURSIVE parents(id, parent_id) AS (
    SELECT id, parent_id FROM nodes WHERE id = ?
    UNION ALL SELECT n.id, n.parent_id FROM nodes n JOIN parents p ON n.id = p.parent_id
  ) SELECT id FROM parents WHERE id != ?`).pluck().all(nodeId, nodeId) as string[];
  for (const id of ancestors.reverse()) {
    if (target.sqlite.prepare('SELECT 1 FROM nodes WHERE id = ?').get(id)) continue;
    flushNodeSyncVersionWithDriver(driver, id, source.id, now);
    await sendReviews(source, target, true, [], id);
  }
  flushNodeSyncVersionWithDriver(driver, nodeId, source.id, now);
  await sendReviews(source, target, true, [], nodeId);
  target.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('host_name', JSON.stringify(target.id), now);
  target.reopen();
  const targetDriver = createBetterSqlite3Driver(target.sqlite);
  expect(loadWorkspaceSnapshot(targetDriver)?.nodesById[nodeId]?.reading?.state).toBe('dismissed');
  expect(dueCards(targetDriver, later)).not.toContain(nodeId);
  resetNodeReviewState(driver, nodeId, { hostName: source.id, deletedAt: later });
  expect(dueCards(driver, later)).toContain(nodeId);
  await sendReviews(source, target, true, [], nodeId);
  expect(dueCards(targetDriver, later)).toContain(nodeId);
}

async function verifyMediaPreview(args: unknown, sqlite: ReturnType<Awaited<ReturnType<typeof restoreFixture>>['peer']>['sqlite']) {
  const preview = await handleSuperMemoImportCommand(NATIVE_COMMANDS.previewSuperMemoImport, args);
  if (!preview || !('rows' in preview)) throw new Error('missing preview');
  expect(makeSuperMemoPreviewReport(preview, 0).unresolvedImages).toBe(243);
  expect(preview.rows.find(row => row.id === 2156)?.unresolvedImages).toHaveLength(16);
  expect(preview.rows.find(row => row.id === 72)?.unresolvedImages).toEqual([]);
  expect(sqlite.prepare('SELECT COUNT(*) FROM workspace_meta WHERE key GLOB ?')
    .pluck().get('supermemo-import:*')).toBe(0);
  return preview.previewSignature;
}

it('previews an XML-only import with a missing image without writing a batch', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  try {
    connection.driver = createBetterSqlite3Driver(source.sqlite);
    const xml = '<SuperMemoCollection><Count>1</Count><SuperMemoElement><ID>1</ID><Type>Topic</Type><Content>'
      + '<Question><![CDATA[Before <img src="missing.png"> after]]></Question>'
      + '</Content></SuperMemoElement></SuperMemoCollection>';
    const elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(xml, 'application/xml'));
    const preview = await handleSuperMemoImportCommand(NATIVE_COMMANDS.previewSuperMemoImport, { elements });
    expect(preview).toMatchObject({
      pairedCollection: false,
      rows: [expect.objectContaining({ id: 1, unresolvedImages: [{ source: 'missing.png', count: 1 }] })]
    });
    expect(source.sqlite.prepare('SELECT COUNT(*) FROM workspace_meta WHERE key GLOB ?')
      .pluck().get('supermemo-import:*')).toBe(0);
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});

const xml = process.env.FOLIOLE_SUPERMEMO_VALIDATION_XML;
const collectionDirectory = process.env.FOLIOLE_SUPERMEMO_VALIDATION_COLLECTION;

const title = 'imports the complete Learning collection and reapplies its saved batch';
if (!xml || !collectionDirectory) {
  // SKIP: requires the private Learning export and collection | 2026-11-13 | revive: supply both validation paths
  it.skip(title, () => {});
} else it(title, { meta: { calibratedMs: 20_000 }, timeout: 180_000 }, async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  try {
    const now = new Date().toISOString();
    source.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(source.id), now);
    connection.driver = createBetterSqlite3Driver(source.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: source.id, libraryPath: source.file });
    publishAttachmentLibraryPathSnapshot({ assetsDir: fixture.root + '/assets', libraryScope: fixture.root });
    await authorizeSelectedImportDirectoryPath(collectionDirectory);
    const elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(readFileSync(xml, 'utf8'), 'application/xml'));
    const args = { elements, collectionDirectory, percent: 0 };
    const previewSignature = await verifyMediaPreview(args, source.sqlite);
    const result = await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport,
      { ...args, previewSignature });
    if (!result || !('batchId' in result)) throw new Error('missing import result');
    expect(result).toMatchObject({ imported: 3434, skipped: 17, unresolvedImages: 243 });
    const nodeCount = source.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get();
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, args)).toEqual(result);
    expect(source.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(nodeCount);
    source.reopen();
    connection.driver = createBetterSqlite3Driver(source.sqlite);
    const batchJson = source.sqlite.prepare('SELECT value FROM workspace_meta WHERE key = ?')
      .pluck().get(`supermemo-import:${result.batchId}`) as string;
    const batch = JSON.parse(batchJson) as { entries: Array<{ id: number; nodeId: string; sourceState?: string; learning?: { history: unknown[] }; unresolvedImages: string[] }> };
    const pending = batch.entries.find(entry => entry.id === 797)!;
    const dismissed = batch.entries.find(entry => entry.id === 75)!;
    expect(pending.sourceState).toBe('pending');
    expect(pending.learning?.history.length).toBeGreaterThan(0);
    expect(source.sqlite.prepare('SELECT COUNT(*) FROM review_log WHERE node_id = ?').pluck().get(pending.nodeId)).toBe(0);
    const due = dueCards(connection.driver, new Date().toISOString());
    expect(due).toContain(pending.nodeId);
    expect(due).not.toContain(dismissed.nodeId);
    expect(dismissed.sourceState).toBe('dismissed');
    expect(dismissed.learning?.history.length).toBeGreaterThan(0);
    expect(source.sqlite.prepare('SELECT state FROM node_reading WHERE node_id = ?').pluck().get(dismissed.nodeId)).toBe('dismissed');
    const illustrated = batch.entries.find(entry => entry.id === 72)!;
    const document = source.sqlite.prepare('SELECT content FROM nodes WHERE id = ?')
      .pluck().get(illustrated.nodeId) as string;
    expect(document.match(/asset:\/\//g)).toHaveLength(21);
    expect(batch.entries.find(entry => entry.id === 2156)?.unresolvedImages).toHaveLength(16);
    const count = source.sqlite.prepare('SELECT count(*) FROM review_log').pluck().get();
    expect(count).toBe(17_926);
    const adjust = (percent: number) => handleSuperMemoImportCommand(NATIVE_COMMANDS.adjustSuperMemoImport, { batchId: result.batchId, percent });
    const readDates = () => source.sqlite.prepare('SELECT node_id, due FROM node_review ORDER BY node_id').all();
    const before = readDates();
    const half = await adjust(50);
    expect(half).toMatchObject({ protectedItems: 0, updated: expect.any(Number) });
    expect(readDates()).not.toEqual(before);
    await adjust(100);
    await adjust(0);
    expect(readDates()).toEqual(before);
    await verifyDismissedSync(source, fixture.peer('target'), dismissed.nodeId, now);

  } finally {
    clearAttachmentLibraryPathSnapshot();
    resetImportPathAuthorizationForTests();
    await fixture.close();
  }
});
