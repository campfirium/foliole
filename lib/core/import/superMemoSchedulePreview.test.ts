import { expect, it } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../review/settings.js';

import { adjustSuperMemoDue, superMemoFullOffset } from './superMemoScheduleOffset.js';
import { blendSuperMemoDue, previewSuperMemoSchedule } from './superMemoSchedulePreview.js';
import type { SuperMemoXmlDraftElement } from './superMemoXmlDraft.js';

const item: SuperMemoXmlDraftElement = {
  id: 2, parentId: null, children: [], sourceType: 'Item', title: 'Question', ordinal: null,
  bodyOrQuestionHtml: ['Question'], answerHtml: ['Answer'], skippedAudioComponents: 0,
  learning: { lastRepetition: '10.11.2026', intervalDays: '30', repetitions: '2', lapses: '0',
    sourceAFactor: null, sourceUFactor: null, history: [
      { date: '09.11.2026', hour: '4', grade: 8, repetition: 1, lapses: 0, raw: '' },
      { date: '10.11.2026', hour: '3.5', grade: 4, repetition: 2, lapses: 0, raw: '' }
    ] }
};
const settings = DEFAULT_REVIEW_SCHEDULER_SETTINGS;

it('blends between the original and the independently replayed date', () => {
  const report = previewSuperMemoSchedule(item, '+08:00', settings, true);
  expect(report).toMatchObject({ sourceDue: '2026-12-10', replayedCount: 1 });
  expect(report.recalculatedDue).not.toBe(report.sourceDue);
  expect(blendSuperMemoDue(report.sourceDue, report.recalculatedDue, 0)).toBe(report.sourceDue);
  expect(blendSuperMemoDue(report.sourceDue, report.recalculatedDue, 100)).toBe(report.recalculatedDue);
  expect(blendSuperMemoDue('2026-12-10', '2026-12-02', 50)).toBe('2026-12-06');
  expect(blendSuperMemoDue(null, report.recalculatedDue, 0)).toBe(report.recalculatedDue);
});

it('preserves a known source date when an unknown event prevents replay', () => {
  const unknown = { ...item, learning: { ...item.learning!, history: [
    ...item.learning!.history, { date: '11.11.2026', hour: '4', grade: 13, repetition: 2, lapses: 0, raw: '' }
  ] } };
  const report = previewSuperMemoSchedule(unknown, '+08:00', settings, true);
  expect(report).toMatchObject({ historyNeedsReview: true, recalculatedDue: null, replayedCount: 0 });
  expect(blendSuperMemoDue(report.sourceDue, report.recalculatedDue, 100)).toBe('2026-12-10');
});

it.each([
  ['2026-12-15', '2026-12-13', 5],
  ['2026-12-05', '2026-12-08', -5]
])('rounds and reapplies signed offsets without accumulating drift', (calculated, midpoint, offset) => {
  const source = '2026-12-10';
  expect(superMemoFullOffset(source, calculated)).toBe(offset);
  const half = adjustSuperMemoDue(source, offset, 0, 50);
  expect(half).toBe(midpoint);
  const full = adjustSuperMemoDue(half, offset, 50, 100);
  expect(full).toBe(calculated);
  expect(adjustSuperMemoDue(full, offset, 100, 0)).toBe(source);
  expect(adjustSuperMemoDue(source, null, 0, 100)).toBe(source);
});
