// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

const mocks = vi.hoisted(() => ({ history: vi.fn(), reading: vi.fn() }));
vi.mock('../database/reviewCalendar.js', () => ({ loadReviewCalendarHistory: mocks.history }));
vi.mock('../database/nodeReadingState.js', () => ({ saveNodeReadingState: mocks.reading }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from './storageReadCommands.js';

beforeEach(() => vi.clearAllMocks());

it('passes one typed calendar range through the native read contract', () => {
  const input = { from: '2026-05-01T04:00:00.000Z', to: '2027-05-01T04:00:00.000Z' };
  const result = { days: [], topicCoverageFrom: '2026-10-02' };
  mocks.history.mockReturnValue(result);
  expect(handleWorkspaceReadCommand(NATIVE_COMMANDS.loadReviewCalendarHistory, input)).toEqual(result);
  expect(mocks.history).toHaveBeenCalledWith(input);
  expect(() => handleWorkspaceReadCommand(NATIVE_COMMANDS.loadReviewCalendarHistory, { ...input, from: 42 })).toThrow();
  expect(() => handleWorkspaceReadCommand(NATIVE_COMMANDS.loadReviewCalendarHistory, { ...input, to: null })).toThrow();
  expect(mocks.history).toHaveBeenCalledTimes(1);
});

it('preserves an explicit completion day and rejects malformed completion metadata before writing', () => {
  const input = { nodeId: 'topic-a', reading: null, updatedAt: '2026-10-02T08:00:00.000Z', completedReviewDay: '2026-10-02' };
  handleReadingAndReviewCommand(NATIVE_COMMANDS.saveNodeReadingState, input);
  expect(mocks.reading).toHaveBeenCalledWith(input);
  expect(() => handleReadingAndReviewCommand(NATIVE_COMMANDS.saveNodeReadingState, { ...input, completedReviewDay: 42 })).toThrow();
  expect(mocks.reading).toHaveBeenCalledTimes(1);
});
