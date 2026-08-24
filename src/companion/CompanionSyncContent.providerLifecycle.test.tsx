import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ ensure: vi.fn(async () => undefined) }));
const syncGroup = {
  created_at: '2026-08-24T00:00:00.000Z', created_by_host_name: 'Android B',
  display_name: 'Library', group_id: 'group-1', local_host_name: 'Android B',
  local_member_state: 'active' as const, members: [{
    approved_by_host_name: 'Android B', authorization_id: 'auth-b', host_name: 'Android B',
    host_platform: 'android', joined_at: '2026-08-24T00:00:00.000Z', state: 'active' as const
  }], timeline_id: 'timeline-1'
};
vi.mock('./companionSyncGroupProviderLifecycle', () => ({
  ensureCompanionSyncGroupProviderForPublicAction: runtime.ensure
}));
vi.mock('./CompanionHandoffReminderRuntime', () => ({
  useCompanionHandoffReminderRuntime: () => ({ settings: {}, updateSettings: vi.fn() })
}));
vi.mock('./CompanionSyncGroupRuntime', () => ({ useCompanionSyncGroupRuntime: () => syncGroup }));
vi.mock('./CompanionSyncPanel', () => ({
  CompanionSyncPanel: (props: { onPull(endpointUrl: string): Promise<unknown> }) => (
    <button onClick={() => void props.onPull('http://desktop:38641')}>Sync Now</button>
  )
}));

import { CompanionSyncContent } from './CompanionSyncContent';

it('establishes provider readiness inside public sync before pulling', async () => {
  const pullFromDesktop = vi.fn(async () => undefined);
  const bootstrapState = {
    booted_at: '2026-08-24T00:00:00.000Z', database_path: 'companion.db',
    database_ready: true, device_id: 'android-b', runtime_kind: 'android-capacitor' as const
  };
  const workspaceSync = {
    bootstrapState, pairingStatus: 'idle', pendingPairRequest: null,
    pullFromDesktop, state: { last_synced_at: null }
  } as never;
  render(<CompanionSyncContent workspaceSync={workspaceSync} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
  await waitFor(() => expect(pullFromDesktop).toHaveBeenCalledOnce());
  expect(runtime.ensure).toHaveBeenCalledWith(bootstrapState, syncGroup, null);
  expect(runtime.ensure.mock.invocationCallOrder[0]).toBeLessThan(
    pullFromDesktop.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
});
