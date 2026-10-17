import { expect, it, vi } from 'vitest';
import { verifyMacosA5Restart } from './macos-a5-single-principal-macos-restart.mjs';

it('captures restart runtime output and preserves readiness failure', async () => {
  const failure = new Error('provider readiness timed out');
  const session = { close: vi.fn().mockResolvedValue(undefined), invoke: vi.fn().mockResolvedValue({ nodesById: {} }) };
  const restarted = {
    close: vi.fn().mockResolvedValue(undefined), load: vi.fn().mockResolvedValue({ sync_group: { group_id: 'group-1' } }),
    waitForState: vi.fn().mockRejectedValue(failure)
  };
  const openSession = vi.fn().mockResolvedValue(restarted);
  await expect(verifyMacosA5Restart({ env: {}, expectedGroupId: 'group-1', openSession,
    repoRoot: '/source', session, sharedRoot: '/evidence' })).rejects.toBe(failure);
  expect(openSession).toHaveBeenCalledWith(expect.objectContaining({
    libraryHome: '/evidence/macos-library',
    runtimeLogPath: '/evidence/macos-restart-runtime.log'
  }));
  expect(session.close).toHaveBeenCalledOnce();
  expect(restarted.close).toHaveBeenCalledOnce();
});
