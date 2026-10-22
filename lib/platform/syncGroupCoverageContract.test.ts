import { expect, it } from 'vitest';

import {
  coverCompletedSyncGroupRound,
  emptySyncGroupCoverage,
  isSyncGroupCoveragePayload,
  mergeSyncGroupCoverage,
  syncGroupCoverageLine
} from './syncGroupCoverageContract.js';

const T1 = '2026-10-01T00:00:00.000Z';
const T2 = '2026-10-02T00:00:00.000Z';
const T3 = '2026-10-03T00:00:00.000Z';

it('advances the group line only when every member owns every other member up to it', () => {
  const members = ['desktop', 'laptop', 'phone'];
  let desktop = coverCompletedSyncGroupRound(emptySyncGroupCoverage(''), 'desktop', 'laptop', T1);
  expect(syncGroupCoverageLine(desktop, members)).toBeNull();
  // The phone only ever talks to the desktop; the laptop learns about it through the desktop.
  desktop = coverCompletedSyncGroupRound(desktop, 'desktop', 'phone', T2);
  expect(syncGroupCoverageLine(desktop, members)).toBeNull();
  desktop = coverCompletedSyncGroupRound(desktop, 'desktop', 'laptop', T3);
  expect(desktop.cells.laptop?.phone).toBe(T2);
  expect(desktop.cells.phone?.laptop).toBe(T1);
  expect(syncGroupCoverageLine(desktop, members)).toBe(T1);
  expect(syncGroupCoverageLine(desktop, ['desktop', 'laptop'])).toBe(T3);
});

it('merges cells forward and ignores coverage collected before another group restore', () => {
  const local = coverCompletedSyncGroupRound(emptySyncGroupCoverage('restore-a'), 'a', 'b', T2);
  const older = coverCompletedSyncGroupRound(emptySyncGroupCoverage('restore-a'), 'a', 'b', T1);
  expect(mergeSyncGroupCoverage(local, older).cells.a?.b).toBe(T2);
  const newer = coverCompletedSyncGroupRound(emptySyncGroupCoverage('restore-a'), 'b', 'c', T3);
  expect(mergeSyncGroupCoverage(local, newer).cells.b?.c).toBe(T3);
  const otherRestore = coverCompletedSyncGroupRound(emptySyncGroupCoverage('restore-b'), 'b', 'c', T3);
  expect(mergeSyncGroupCoverage(local, otherRestore)).toEqual(local);
});

it('validates coverage carried in member state', () => {
  expect(isSyncGroupCoveragePayload({ basis: '', cells: { a: { b: T1 } } })).toBe(true);
  expect(isSyncGroupCoveragePayload({ basis: '', cells: { a: { a: T1 } } })).toBe(false);
  expect(isSyncGroupCoveragePayload({ basis: '', cells: { a: { b: 'yesterday' } } })).toBe(false);
  expect(isSyncGroupCoveragePayload({ cells: {} })).toBe(false);
});
