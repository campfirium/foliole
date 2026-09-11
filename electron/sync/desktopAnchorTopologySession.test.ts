import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { serializePreparedAnchorTxt } from '../../lib/platform/syncAnchorTopologyContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  onService: null as null | ((event: Record<string, unknown>) => void),
  stop: vi.fn()
}));

vi.mock('./desktopDnsSd.js', () => ({
  startDesktopDnsSdSession: (callbacks: typeof runtime) => {
    runtime.onService = callbacks.onService;
    return { stop: runtime.stop };
  }
}));

import {
  DESKTOP_ANCHOR_OBSERVATION_MS,
  startDesktopAnchorTopologySession
} from './desktopAnchorTopologySession.js';

const group = {
  devices: [], display_name: 'Studio', group_id: 'group-1',
  local_device_identity_key: 'desktop-b'
} as never;

function anchorService(deviceId = 'desktop-a') {
  return {
    addresses: ['192.168.1.20'], domain: 'local.', fqdn: `${deviceId}.local.`,
    host: `${deviceId}.local.`, interfaceIndex: 1, name: deviceId, port: 38641,
    txt: { device_id: deviceId, group_id: 'group-1', group_tag: 'tag-1',
      provider_platform: 'darwin', ...serializePreparedAnchorTxt('anchor') },
    type: '_foliole-sync._tcp'
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  runtime.onService = null;
});

afterEach(() => vi.useRealTimers());

it('declares the first desktop anchor only after the complete observation window', async () => {
  const states: Array<{ role: string }> = [];
  const session = startDesktopAnchorTopologySession({
    group, onAnchor: vi.fn(async () => true), onAnchorLost: vi.fn(),
    onState: (state) => states.push(state)
  });

  await vi.advanceTimersByTimeAsync(DESKTOP_ANCHOR_OBSERVATION_MS - 1);
  expect(states.at(-1)?.role).toBe('observing');
  await vi.advanceTimersByTimeAsync(1);
  expect(states.at(-1)?.role).toBe('anchor');
  session.stop();
});

it('syncs before the stable lower-id anchor makes the local anchor a member', async () => {
  const service = anchorService();
  const fetchDiscovery = vi.fn(async () => new Response(JSON.stringify({
    group_id: 'group-1', group_tag: 'tag-1', provider_device_id: 'desktop-a',
    provider_platform: 'darwin', topology_role: 'anchor',
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  })));
  const states: Array<{ role: string; status: string }> = [];
  const onAnchor = vi.fn(async () => true);
  const session = startDesktopAnchorTopologySession({
    fetchDiscovery, group, onAnchor, onAnchorLost: vi.fn(),
    onState: (state) => states.push(state)
  });
  await vi.advanceTimersByTimeAsync(DESKTOP_ANCHOR_OBSERVATION_MS);
  runtime.onService?.({ kind: 'found', service });

  await vi.waitFor(() => expect(states.at(-1)).toMatchObject({ role: 'member', status: 'ready' }));
  expect(states).toContainEqual(expect.objectContaining({ role: 'anchor', status: 'sync_before_demote' }));
  expect(onAnchor).toHaveBeenCalledWith(expect.objectContaining({ peerDeviceId: 'desktop-a' }), true);
  session.stop();
});
