import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { provideSupportLogSlowOperations, serializeSupportLog, startSupportLog, stopSupportLog } from '../../supportLog/supportLog';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { timeCompanionActivity } from './companionActivityTiming';
import {
  flushCompanionSlowOperations, installCompanionSlowOperationLog, readCompanionSlowOperations,
  recordCompanionMutationTiming, resetCompanionSlowOperationsForTests
} from './companionSlowOperations';
import { markWholeLibraryWork, resetWholeLibraryWorkForTests } from './companionWholeLibraryWork';

let uninstall: () => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'performance'] });
  resetCompanionSlowOperationsForTests();
  resetWholeLibraryWorkForTests();
  companionWorkspaceSnapshots.reset(librarySnapshot());
  uninstall = installCompanionSlowOperationLog();
});

afterEach(() => {
  uninstall();
  stopSupportLog();
  provideSupportLogSlowOperations(undefined);
  companionWorkspaceSnapshots.reset(null);
  resetCompanionSlowOperationsForTests();
  localStorage.clear();
  vi.useRealTimers();
});

function librarySnapshot(): WorkspaceSnapshot {
  const node = (id: string, attachments: number) => ({ id, title: `Secret Book ${id}`, content: 'private body text',
    attachments: Array.from({ length: attachments }, (_, index) => ({ attachmentId: `${id}-${index}`,
      originalName: '/Users/someone/Secret Book.pdf' })) });
  return { activeNodeId: null, nodeOrder: ['a', 'b', 'c'], trashedNodeIds: [], untitledSequenceByParent: {},
    nodesById: { a: node('a', 2), b: node('b', 0), c: node('c', 1) } } as unknown as WorkspaceSnapshot;
}

function slowTask(ms: number, work: () => void = () => undefined) {
  return async () => { work(); vi.advanceTimersByTime(ms); };
}

it('records a slow refresh with library scale and the whole-library passes inside its span', async () => {
  markWholeLibraryWork('full-read'); // Before the span: must not be attributed to it.
  vi.advanceTimersByTime(10);
  await timeCompanionActivity('workspace-refresh', slowTask(650, () => {
    markWholeLibraryWork('full-refresh');
    markWholeLibraryWork('full-read');
  }));
  await timeCompanionActivity('workspace-refresh', slowTask(120));

  expect(readCompanionSlowOperations().entries).toEqual([{ operation: 'workspace-refresh', status: 'done', durationMs: 650,
    nodes: 3, attachments: 3, fullReads: 1, fullRefreshes: 1, occurredAt: expect.stringMatching(/:00\.000Z$/u) }]);
});

it('names a slow mutation from its committed scope and keeps node ids, titles and paths out', async () => {
  await runCompanionHighValueMutationTask(slowTask(800, () => {
    markWholeLibraryWork('full-read');
    markWholeLibraryWork('full-read');
  }), { kind: 'nodes', nodeIds: ['a', 'b'], structure: true, trash: true });

  const report = readCompanionSlowOperations();
  expect(report.entries).toEqual([expect.objectContaining({ operation: 'mutation.trash', status: 'done', durationMs: 800,
    queueMs: 0, scopeNodes: 2, fullReads: 2, fullRefreshes: 0 })]);
  const text = JSON.stringify(report);
  for (const secret of ['Secret', 'private', '/Users', '"a"', 'a-0']) expect(text).not.toContain(secret);
});

it('records a failed slow mutation before rethrowing its error', async () => {
  await expect(runCompanionHighValueMutationTask(async () => {
    vi.advanceTimersByTime(900);
    throw new Error('write failed');
  }, { kind: 'full' })).rejects.toThrow('write failed');
  expect(readCompanionSlowOperations().entries).toEqual([expect.objectContaining({ operation: 'mutation.full', status: 'failed' })]);
});

it('keeps sync and backup rounds out unless they run far beyond a normal round', async () => {
  await timeCompanionActivity('folder-backup', slowTask(5000));
  await timeCompanionActivity('sync', slowTask(31_000));
  expect(readCompanionSlowOperations().entries.map(entry => entry.operation)).toEqual(['sync']);
});

it('caps the log, counts what it dropped, and writes storage once per burst', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  for (let index = 0; index < 45; index += 1) recordCompanionMutationTiming({ kind: 'nodes', nodeIds: [] }, performance.now() - 700, performance.now(), 'done');
  expect(setItem).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(setItem).toHaveBeenCalledTimes(1);
  const saved = JSON.parse(localStorage.getItem('foliole-slow-operations')!);
  expect(saved.entries).toHaveLength(40);
  expect(saved.omitted).toBe(5);
  setItem.mockRestore();
});

it('drops entries older than three days', () => {
  recordCompanionMutationTiming(undefined, performance.now() - 600, performance.now(), 'done');
  vi.advanceTimersByTime(3 * 86_400_000 + 60_000);
  expect(readCompanionSlowOperations().entries).toEqual([]);
});

it('adds the slow-operation log to the exported phone support report only', () => {
  recordCompanionMutationTiming({ kind: 'nodes', nodeIds: ['a'] }, performance.now() - 600, performance.now(), 'done');
  flushCompanionSlowOperations();
  provideSupportLogSlowOperations(readCompanionSlowOperations);
  startSupportLog();
  stopSupportLog();
  expect(JSON.parse(serializeSupportLog('ios')!).slowOperations).toMatchObject({
    thresholdsMs: { interactive: 500, background: 1500, round: 30_000 },
    entries: [{ operation: 'mutation.content', scopeNodes: 1, nodes: 3, attachments: 3 }], omitted: 0 });
  expect(JSON.parse(serializeSupportLog('desktop')!)).not.toHaveProperty('slowOperations');
});
