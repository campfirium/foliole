import { expect, it } from 'vitest';

import { buildSequentialReadingReleaseUpdates } from './sequentialReadingRelease.js';

it('releases only the first available derived topic in sequential mode', () => {
  expect(buildSequentialReadingReleaseUpdates({
    candidates: [
      { content: 'Chapter 1', nodeId: 'chapter-1' },
      { content: 'Chapter 2', nodeId: 'chapter-2' },
      { content: 'Chapter 3', nodeId: 'chapter-3' }
    ],
    defaultPriority: 0,
    mode: 'sequential',
    now: '2026-05-21T00:00:00.000Z'
  })).toMatchObject([
    { nodeId: 'chapter-1', reading: { state: 'active' } },
    { nodeId: 'chapter-2', reading: { state: 'locked' } },
    { nodeId: 'chapter-3', reading: { state: 'locked' } }
  ]);
});

it('keeps all available derived topics active in free mode', () => {
  expect(buildSequentialReadingReleaseUpdates({
    candidates: [
      { content: 'Chapter 1', nodeId: 'chapter-1' },
      { content: 'Chapter 2', nodeId: 'chapter-2', reading: { state: 'locked' } }
    ],
    defaultPriority: 0,
    mode: 'free',
    now: '2026-05-21T00:00:00.000Z'
  })).toMatchObject([
    { nodeId: 'chapter-1', reading: { state: 'active' } },
    { nodeId: 'chapter-2', reading: { state: 'active' } }
  ]);
});
