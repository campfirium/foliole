// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { recomputeNodeReview } from '../../lib/core/database/reviewProjection.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { collectReviewQueueCandidates } from '../../lib/core/review/queue/reviewQueuePlannerCandidates.js';
import { createReviewQueueTimeInput } from '../../lib/core/review/queue/reviewQueueTimeInput.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { listSuperMemoImports } from '../import/adjustSuperMemoImport.js';
import { handleSuperMemoImportCommand } from '../ipc/superMemoImportCommands.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { history, reviewFacts, reviewState, score, sendReviews } from './reviewProjection.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

const element: SuperMemoXmlDraftElement = {
  id: 2, parentId: null, children: [], title: 'Imported card', sourceType: 'Item', ordinal: null,
  bodyOrQuestionHtml: ['Question'], answerHtml: ['Answer'], skippedAudioComponents: 0,
  learning: {
    lastRepetition: '10.11.2025', intervalDays: '300', repetitions: '2', lapses: '0',
    sourceAFactor: null, sourceUFactor: null,
    history: [{ date: '10.11.2025', hour: '8', grade: 4, repetition: 2, lapses: 0, raw: 'original grade 4' }]
  }
};

function dueCards(driver: NonNullable<typeof connection.driver>, now: string) {
  const snapshot = loadWorkspaceSnapshot(driver)!;
  return collectReviewQueueCandidates({
    ...snapshot, trashedNodeIds: new Set(snapshot.trashedNodeIds),
    includeScheduled: false, time: createReviewQueueTimeInput(0, 0), now
  }).fsrsCandidates.map(node => node.id);
}

async function expectBatchBackup(sqlite: InstanceType<typeof Database>, root: string, batchId: string) {
  const backupPath = path.join(root, 'import-backup.sqlite');
  await sqlite.backup(backupPath);
  const backup = new Database(backupPath, { readonly: true });
  try {
    const value = backup.prepare("SELECT value FROM workspace_meta WHERE key = ?").pluck()
      .get(`supermemo-import:${batchId}`) as string;
    expect(JSON.parse(value).entries[0].learning.history[0].raw).toBe('original grade 4');
  } finally {
    backup.close();
  }
}

it('imports real history and preserves the selected date through reopen, recompute, sync and first scoring', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  const now = '2026-11-13T08:00:00.000Z';
  try {
    source.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('host_name', JSON.stringify(source.id), now);
    connection.driver = createBetterSqlite3Driver(source.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: source.id, libraryPath: source.file });
    const args = { elements: [element, { ...element, id: 3, title: 'Second imported card' },
      { ...element, id: 4, title: 'Third imported card' }], percent: 0 };
    const result = await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, args);
    expect(result).toMatchObject({ imported: 3, skipped: 0 });
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, args)).toEqual(result);
    const batch = listSuperMemoImports()[0]!;
    await expectBatchBackup(source.sqlite, fixture.root, batch.batchId);
    const [first, second, third] = source.sqlite.prepare('SELECT node_id, due FROM node_review ORDER BY node_id').all() as
      { node_id: string; due: string }[];
    expect(first!.due).toEqual(new Date('2026-09-06T00:00:00').toISOString());
    source.reopen();
    connection.driver = createBetterSqlite3Driver(source.sqlite);
    expect(recomputeNodeReview(connection.driver, first!.node_id)?.due).toBe(first!.due);
    expect(dueCards(connection.driver, '2026-09-05T00:00:00')).not.toContain(first!.node_id);
    expect(dueCards(connection.driver, '2026-09-07T00:00:00')).toContain(first!.node_id);
    flushNodeSyncVersionWithDriver(connection.driver, first!.node_id, source.id, now);
    await sendReviews(source, target, true, [], first!.node_id);
    target.reopen();
    expect(reviewState(target)).toEqual([expect.objectContaining({ due: first!.due, reps: 1 })]);
    expect(reviewFacts(target)).toEqual([expect.objectContaining({ grade: 3 })]);
    score(source, 'actual', now, 3, second!.node_id);
    const manualDue = '2027-01-01T08:00:00.000Z';
    source.sqlite.prepare('UPDATE node_review SET due = ? WHERE node_id = ?').run(manualDue, third!.node_id);
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.previewSuperMemoAdjustment, { batchId: batch.batchId, percent: 100 }))
      .toMatchObject({ updated: 1, protectedItems: 2 });
    expect(recomputeNodeReview(connection.driver, first!.node_id)?.due).toBe(first!.due);
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.adjustSuperMemoImport, { batchId: batch.batchId, percent: 100 }))
      .toMatchObject({ updated: 1, protectedItems: 2 });
    expect(source.sqlite.prepare('SELECT due FROM node_review WHERE node_id = ?').pluck().get(third!.node_id)).toBe(manualDue);
    const adjusted = recomputeNodeReview(connection.driver, first!.node_id)!.due;
    expect(adjusted).not.toBe(first!.due);
    flushNodeSyncVersionWithDriver(connection.driver, first!.node_id, source.id, now);
    await sendReviews(source, target, true, [], first!.node_id);
    expect(reviewState(target)).toEqual([expect.objectContaining({ due: adjusted })]);
    score(source, 'actual-first', now, 3, first!.node_id);
    await sendReviews(source, target, true, [], first!.node_id);
    expect(reviewState(target)).toEqual([expect.objectContaining({ reps: 2, due: expect.not.stringMatching(adjusted) })]);
    history(source, 'undo', 'actual-first', '2026-11-13T09:00:00.000Z', first!.node_id);
    await sendReviews(source, target, true, [], first!.node_id);
    expect(reviewState(target)).toEqual([expect.objectContaining({ reps: 1, due: adjusted })]);
  } finally {
    await fixture.close();
  }
});

it('keeps nested Topics and moves a Folder to the nearest Folder ancestor', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const now = '2026-11-13T08:00:00.000Z';
  try {
    source.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('host_name', JSON.stringify(source.id), now);
    connection.driver = createBetterSqlite3Driver(source.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: source.id, libraryPath: source.file });
    const make = (id: number, parentId: number | null, title: string, body: string[], children: number[],
      sourceType = 'Topic'): SuperMemoXmlDraftElement => ({
      ...element, id, parentId, title, bodyOrQuestionHtml: body, answerHtml: [], learning: null, children, sourceType
    });
    const elements = [
      make(1, null, 'Root folder', [], [2], 'Concept'),
      make(2, 1, 'Parent topic', ['Body'], [3, 5]),
      make(3, 2, 'Empty parent', [], [4]),
      make(4, 3, 'Nested topic', ['Child'], []),
      make(5, 2, 'Nested folder', [], [6], 'Concept'),
      make(6, 5, 'Folder topic', ['Child'], [])
    ].map(entry => entry.id === 3 ? { ...entry, learning: element.learning } : entry);
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, { elements, percent: 0 }))
      .toMatchObject({ imported: 5, skipped: 1 });
    const paths = source.sqlite.prepare(`SELECT n.title, p.title AS parent FROM nodes n
      LEFT JOIN nodes p ON p.id = n.parent_id WHERE n.title IN ('Parent topic','Nested topic','Nested folder','Folder topic')
      ORDER BY n.title`).all();
    const snapshot = loadWorkspaceSnapshot(connection.driver)!;
    expect(Object.values(snapshot.nodesById).find(node => node.title === 'Nested topic')?.reading?.state).toBe('done');
    expect(paths).toEqual([
      { title: 'Folder topic', parent: 'Nested folder' },
      { title: 'Nested folder', parent: 'Root folder' },
      { title: 'Nested topic', parent: 'Parent topic' },
      { title: 'Parent topic', parent: 'Root folder' }
    ]);
  } finally {
    await fixture.close();
  }
});
