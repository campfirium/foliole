// @vitest-environment node

import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  preview: vi.fn(() => ({ again: {} })),
  runOwner: vi.fn()
}));
vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: state.runOwner
}));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn(), reviewPreview: state.preview }));
vi.mock('./boot.js', () => ({ bootReport: vi.fn() }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { SqliteConnectionCoordinator } from '../database/sqliteConnectionCoordinator.js';

import { handleReviewCommand } from './reviewCommands.js';

it('queues review preview behind the active SQLite owner', async () => {
  const coordinator = new SqliteConnectionCoordinator();
  state.runOwner.mockImplementation((execute) => coordinator.runExclusive(execute));
  state.preview.mockImplementation(() => {
    coordinator.assertAccess();
    return { again: {} };
  });
  let release!: () => void;
  const competing = coordinator.runExclusive(() =>
    new Promise<void>((resolve) => { release = resolve; }));
  const preview = handleReviewCommand({ command: 'review_preview', args: {
    request: { card: { due: '2026-10-06T00:00:00.000Z', last_review: null,
      state: 0, stability: 1, difficulty: 2, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0 },
    now: '2026-10-06T00:00:00.000Z' }
  } });
  await Promise.resolve();
  expect(state.preview).not.toHaveBeenCalled();
  release();
  await competing;
  await expect(preview).resolves.toEqual({ again: {} });
});
