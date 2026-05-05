import { describe, expect, it } from 'vitest';

import { mergeCompanionSyncProgressSession } from './companionSyncProgressSession';

function testKeepsBodySessionBaselineAcrossPasses() {
  const merged = mergeCompanionSyncProgressSession(
    {
      completed: 64,
      completedBytes: 2_097_152,
      phase: 'content',
      total: 616,
      totalBytes: 20_971_520
    },
    {
      completed: 32,
      completedBytes: 1_048_576,
      phase: 'content',
      total: 552,
      totalBytes: 18_874_368
    }
  );

  expect(merged).toEqual(expect.objectContaining({
    completed: 96,
    completedBytes: 3_145_728,
    phase: 'content',
    total: 616,
    totalBytes: 20_971_520
  }));
}

function testResetsWhenPhaseChanges() {
  const next = {
    attachmentBreakdown: { imageAttachments: 4 },
    completed: 0,
    phase: 'attachment' as const,
    total: 4
  };

  expect(mergeCompanionSyncProgressSession(
    { completed: 64, phase: 'content', total: 616 },
    next
  )).toBe(next);
}

function testResetsWhenWorkloadGrows() {
  const next = { completed: 0, phase: 'content' as const, total: 640 };

  expect(mergeCompanionSyncProgressSession(
    { completed: 64, phase: 'content', total: 616 },
    next
  )).toBe(next);
}

describe('mergeCompanionSyncProgressSession', () => {
  it('keeps the body progress baseline across resource passes', testKeepsBodySessionBaselineAcrossPasses);

  it('resets the progress session when the resource phase changes', testResetsWhenPhaseChanges);

  it('resets the progress session when the known workload grows', testResetsWhenWorkloadGrows);
});
