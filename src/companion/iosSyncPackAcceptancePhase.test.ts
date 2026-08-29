import { beforeEach, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ query: vi.fn(), run: vi.fn() }));

vi.mock('../shared/platform/companion/runtime/iosCompanionActiveDatabase', () => ({
  readIosCompanionDatabase: (task: (db: typeof database) => unknown) => task(database),
  writeIosCompanionDatabase: (task: (db: typeof database) => unknown) => task(database)
}));

import {
  advanceIosSyncPackAcceptancePhase,
  loadIosSyncPackAcceptancePhase
} from './iosSyncPackAcceptancePhase';

beforeEach(() => {
  vi.clearAllMocks();
  database.query.mockResolvedValue([]);
  database.run.mockResolvedValue({ changes: 1 });
});

it('defaults missing or invalid native acceptance state to apply', async () => {
  await expect(loadIosSyncPackAcceptancePhase()).resolves.toBe('apply');
  database.query.mockResolvedValue([{ value: 'invalid' }]);
  await expect(loadIosSyncPackAcceptancePhase()).resolves.toBe('apply');
});

it('persists the next phase in companion_meta before process termination', async () => {
  database.query.mockResolvedValue([{ value: 'reapply' }]);

  await expect(loadIosSyncPackAcceptancePhase()).resolves.toBe('reapply');
  await advanceIosSyncPackAcceptancePhase('reapply');

  expect(database.run).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO companion_meta'),
    ['ios_sync_pack_acceptance_phase', 'wrong-target', expect.any(String)]
  );
});
