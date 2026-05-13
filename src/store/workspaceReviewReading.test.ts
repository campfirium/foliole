import { describe, expect, it } from 'vitest';

import type { NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import type { ReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';

import { buildNextReadingProfile } from './workspaceReviewReading';

const BASE_READING: NodeReadingProfile = {
  intervalDurationMs: 1000,
  intervalGrowthFactor: 1.2,
  lastHandledAt: '2026-05-13T00:00:00.000Z',
  nextAt: '2026-05-14T00:00:00.000Z',
  priority: 3,
  readingPosition: 0,
  repetitionCount: 1,
  state: 'active'
};

function createNextReading(priority: unknown): ReadingScheduleCoreFields {
  return {
    intervalDurationMs: 2000,
    intervalGrowthFactor: 1.3,
    lastHandledAt: '2026-05-15T00:00:00.000Z',
    nextAt: '2026-05-16T00:00:00.000Z',
    priority,
    repetitionCount: 2
  } as ReadingScheduleCoreFields;
}

describe('buildNextReadingProfile', () => {
  it('keeps valid reading schedule priority values', () => {
    expect(buildNextReadingProfile(createNextReading(7), BASE_READING).priority).toBe(7);
  });

  it('falls back from invalid schedule priority to current reading priority', () => {
    expect(buildNextReadingProfile(createNextReading('bad'), BASE_READING).priority).toBe(3);
  });

  it('falls back to unified queue default priority when both priority sources are invalid', () => {
    expect(buildNextReadingProfile(createNextReading(null), { ...BASE_READING, priority: 99 } as NodeReadingProfile).priority).toBe(5);
  });
});
