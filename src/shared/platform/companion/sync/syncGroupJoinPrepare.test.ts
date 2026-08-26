import { beforeEach, expect, it, vi } from 'vitest';

const plugin = {
  acceptRequest: vi.fn(), collectAcceptance: vi.fn(), loadRequests: vi.fn(),
  receiveRequest: vi.fn(), rejectRequest: vi.fn()
};
const registerPlugin = vi.fn(() => plugin);

vi.mock('@capacitor/core', () => ({ registerPlugin }));

beforeEach(() => vi.clearAllMocks());

it('projects the inactive join prepare contract to the Capacitor host', async () => {
  const { FolioleSyncGroupJoinPrepare } = await import('./syncGroupJoinPrepare.js');
  expect(registerPlugin).toHaveBeenCalledWith('FolioleSyncGroupJoinPrepare');
  await FolioleSyncGroupJoinPrepare.loadRequests();
  await FolioleSyncGroupJoinPrepare.acceptRequest({ request_id: 'request-a' });
  expect(plugin.loadRequests).toHaveBeenCalledOnce();
  expect(plugin.acceptRequest).toHaveBeenCalledWith({ request_id: 'request-a' });
});
