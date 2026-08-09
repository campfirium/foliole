import { vi } from 'vitest';

vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: vi.fn(async () => null)
}));
