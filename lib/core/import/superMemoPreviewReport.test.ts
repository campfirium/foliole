import { expect, it } from 'vitest';

import type { NativeSuperMemoPreviewRow } from '../../platform/nativeSuperMemoImportContract.js';

import { makeSuperMemoPreviewReport } from './superMemoPreviewReport.js';

function card(id: number, sourceDue: string | null, recalculatedDue: string | null): NativeSuperMemoPreviewRow {
  return {
    id, sourceDue, recalculatedDue, parentId: null, sourceType: 'Item', title: '',
    outcome: 'item', issue: null, intervalDays: 30, lastRepetition: null, historyCount: 0,
    replayedCount: 0, historyNeedsReview: false
  };
}

it('counts newly due and deferred cards separately and includes cards with only one date in the total', () => {
  const preview = {
    referenceDay: '2026-11-12',
    rows: [
      card(1, '2026-11-16', '2026-11-08'),
      card(2, '2026-11-12', '2026-11-16'),
      card(3, null, '2026-11-10'),
      card(4, '2026-11-10', null),
      card(5, null, null)
    ]
  };
  expect(makeSuperMemoPreviewReport(preview, 0)).toMatchObject({
    sourceDue: 2, totalDue: 3, addedDue: 0, deferred: 0, unknownDates: 3, noHistory: 5
  });
  for (const percent of [50, 100]) {
    expect(makeSuperMemoPreviewReport(preview, percent)).toMatchObject({
      sourceDue: 2, totalDue: 3, addedDue: 1, deferred: 1, unknownDates: 3, noHistory: 5
    });
  }
});

it('counts pending as fresh cards and excludes dismissed cards at every blend', () => {
  const preview = {
    referenceDay: '2026-11-12',
    rows: [
      { ...card(1, null, null), sourceState: 'pending' as const, historyCount: 3 },
      { ...card(2, '2026-11-10', '2026-11-10'), sourceState: 'dismissed' as const }
    ]
  };
  for (const percent of [0, 50, 100]) {
    expect(makeSuperMemoPreviewReport(preview, percent))
      .toMatchObject({ sourceDue: 0, totalDue: 1, pendingNewItems: 1, addedDue: 0, unknownDates: 0 });
  }
});
