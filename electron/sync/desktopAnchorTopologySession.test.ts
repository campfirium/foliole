import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { serializePreparedAnchorTxt } from '../../lib/platform/syncAnchorTopologyContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  onError: null as null | ((error: Error) => void),
  onService: null as null | ((event: Record<string, unknown>) => void),
  stop: vi.fn()
}));

vi.mock('./desktopDnsSd.js', () => ({
  startDesktopDnsSdSession: (callbacks: typeof runtime) => {
    runtime.onError = callbacks.onError;
    runtime.onService = callbacks.onService;
    return { stop: runtime.stop };
  }
}));

import {
  startDesktopAnchorTopologySession
} from './desktopAnchorTopologySession.js';
import { DESKTOP_SYNC_GROUP_DISCOVERY_GRACE_MS } from './desktopSyncGroupDiscoveryTiming.js';

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
  runtime.onError = null;
  runtime.onService = null;
});

afterEach(() => vi.useRealTimers());

it('declares the first desktop anchor only after the complete observation window', async () => {
  const states: Array<{ role: string }> = [];
  const session = startDesktopAnchorTopologySession({
    group, onAnchor: vi.fn(async () => true), onAnchorLost: vi.fn(),
    onState: (state) => states.push(state)
  });

  await vi.advanceTimersByTimeAsync(DESKTOP_SYNC_GROUP_DISCOVERY_GRACE_MS - 1);
  expect(states.at(-1)?.role).toBe('observing');
  await vi.advanceTimersByTimeAsync(1);
  expect(states.at(-1)?.role).toBe('anchor');
  session.stop();
});

it('waits for a rebuilt browse session instead of electing during its failure', async () => {
  const states: Array<{ role: string }> = [];
  const session = startDesktopAnchorTopologySession({
    group, onAnchor: vi.fn(async () => true), onAnchorLost: vi.fn(),
    onState: (state) => states.push(state)
  });
  const staleService = runtime.onService;
  runtime.onError?.(new Error('browse failed'));
  await vi.advanceTimersByTimeAsync(999);
  expect(states.at(-1)?.role).toBe('observing');

  await vi.advanceTimersByTimeAsync(1);
  staleService?.({ kind: 'found', service: anchorService() });
  expect(states.at(-1)?.role).toBe('observing');
  session.stop();
});

it('rechecks an earlier anchor before claiming it is connected after browse recovery', async () => {
  const fetchDiscovery = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ group_id: 'group-1', group_tag: 'tag-1',
      provider_device_id: 'desktop-a', provider_platform: 'darwin', topology_role: 'anchor',
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR })))
    .mockRejectedValueOnce(new Error('offline'));
  const states: Array<{ role: string; status: string }> = [];
  const onAnchorLost = vi.fn();
  const session = startDesktopAnchorTopologySession({ fetchDiscovery, group,
    onAnchor: vi.fn(async () => true), onAnchorLost, onState: (state) => states.push(state) });
  runtime.onService?.({ kind: 'found', service: anchorService() });
  await vi.waitFor(() => expect(states.at(-1)?.status).toBe('ready'));
  runtime.onError?.(new Error('browse failed'));
  await vi.advanceTimersByTimeAsync(1_000);
  expect(states).toContainEqual(expect.objectContaining({ role: 'member', status: 'waiting_anchor' }));
  await vi.waitFor(() => expect(onAnchorLost).toHaveBeenCalledWith('desktop-a'));
  expect(states.at(-1)?.status).toBe('waiting_anchor');
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
  await vi.advanceTimersByTimeAsync(DESKTOP_SYNC_GROUP_DISCOVERY_GRACE_MS);
  runtime.onService?.({ kind: 'found', service });

  await vi.waitFor(() => expect(states.at(-1)).toMatchObject({ role: 'member', status: 'ready' }));
  expect(states).toContainEqual(expect.objectContaining({ role: 'anchor', status: 'sync_before_demote' }));
  expect(onAnchor).toHaveBeenCalledWith(expect.objectContaining({ peerDeviceId: 'desktop-a' }), true);
  session.stop();
});

it('does not self-elect while a discovered anchor probe is still pending', async () => {
  let finishProbe!: (response: Response) => void;
  const fetchDiscovery = vi.fn(() => new Promise<Response>((resolve) => { finishProbe = resolve; }));
  const states: Array<{ role: string }> = [];
  const session = startDesktopAnchorTopologySession({
    fetchDiscovery, group, onAnchor: vi.fn(async () => true), onAnchorLost: vi.fn(),
    onState: (state) => states.push(state)
  });

  runtime.onService?.({ kind: 'found', service: anchorService() });
  await vi.advanceTimersByTimeAsync(DESKTOP_SYNC_GROUP_DISCOVERY_GRACE_MS);
  expect(states.at(-1)?.role).toBe('observing');

  finishProbe(new Response(JSON.stringify({
    group_id: 'group-1', group_tag: 'tag-1', provider_device_id: 'desktop-a',
    provider_platform: 'darwin', topology_role: 'anchor',
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  })));
  await vi.waitFor(() => expect(states.at(-1)?.role).toBe('member'));
  session.stop();
});

it('self-elects after the discovery grace and all candidate probes fail', async () => {
  let finishProbe!: (response: Response) => void;
  const fetchDiscovery = vi.fn(() => new Promise<Response>((resolve) => { finishProbe = resolve; }));
  const states: Array<{ role: string }> = [];
  const session = startDesktopAnchorTopologySession({
    fetchDiscovery, group, onAnchor: vi.fn(async () => true), onAnchorLost: vi.fn(),
    onState: (state) => states.push(state)
  });

  runtime.onService?.({ kind: 'found', service: anchorService() });
  await vi.advanceTimersByTimeAsync(DESKTOP_SYNC_GROUP_DISCOVERY_GRACE_MS);
  expect(states.at(-1)?.role).toBe('observing');

  finishProbe(new Response(null, { status: 503 }));
  await vi.waitFor(() => expect(states.at(-1)?.role).toBe('anchor'));
  session.stop();
});

it('keeps a connected anchor when a lost DNS-SD event passes the HTTP probe', async () => {
  const service = anchorService();
  const fetchDiscovery = vi.fn(async () => new Response(JSON.stringify({
    group_id: 'group-1', group_tag: 'tag-1', provider_device_id: 'desktop-a',
    provider_platform: 'darwin', topology_role: 'anchor',
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  })));
  const onAnchorLost = vi.fn();
  const states: Array<{ role: string; status: string }> = [];
  const session = startDesktopAnchorTopologySession({
    fetchDiscovery, group, onAnchor: vi.fn(async () => true), onAnchorLost,
    onState: (state) => states.push(state)
  });

  runtime.onService?.({ kind: 'found', service });
  await vi.waitFor(() => expect(states.at(-1)).toMatchObject({ role: 'member', status: 'ready' }));
  runtime.onService?.({ kind: 'lost', service });
  await vi.waitFor(() => expect(fetchDiscovery).toHaveBeenCalledTimes(2));

  expect(onAnchorLost).not.toHaveBeenCalled();
  expect(states.at(-1)).toMatchObject({ role: 'member', status: 'ready' });
  session.stop();
});

it('reports a lost anchor when the HTTP probe fails', async () => {
  const service = anchorService();
  const fetchDiscovery = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      group_id: 'group-1', group_tag: 'tag-1', provider_device_id: 'desktop-a',
      provider_platform: 'darwin', topology_role: 'anchor',
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
    })))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  const onAnchorLost = vi.fn();
  const states: Array<{ role: string; status: string }> = [];
  const session = startDesktopAnchorTopologySession({
    fetchDiscovery, group, onAnchor: vi.fn(async () => true), onAnchorLost,
    onState: (state) => states.push(state)
  });

  runtime.onService?.({ kind: 'found', service });
  await vi.waitFor(() => expect(states.at(-1)).toMatchObject({ role: 'member', status: 'ready' }));
  runtime.onService?.({ kind: 'lost', service });
  await vi.waitFor(() => expect(onAnchorLost).toHaveBeenCalledWith('desktop-a'));
  session.stop();
});
