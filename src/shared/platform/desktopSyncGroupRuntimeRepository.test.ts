import { expect, it, vi } from 'vitest';

import { loadDesktopSyncGroupOverview } from './desktopSyncGroupRuntimeRepository';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('./runtimeInvoke', () => ({ getRuntimeInvoke: () => invoke }));

it('preserves relay eligibility and delivery status when loading desktop sync settings', async () => {
  const configured = { configured: true, device_id: null, delivered: false };
  const delivered = { configured: true, device_id: 'paired-phone', delivered: true };
  invoke.mockResolvedValueOnce({ webdav_relay: configured }).mockResolvedValueOnce({ webdav_relay: delivered });

  expect((await loadDesktopSyncGroupOverview()).webdav_relay).toEqual(configured);
  expect((await loadDesktopSyncGroupOverview()).webdav_relay).toEqual(delivered);
});
