import { beforeEach, expect, it, vi } from 'vitest';

import type { SyncGroupDiscoverySnapshot } from '../../lib/platform/syncGroupDiscoveryContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  callback: null as null | ((event: Record<string, unknown>) => void),
  stop: vi.fn()
}));

vi.mock('./desktopDnsSd.js', () => ({
  startDesktopDnsSdBrowse: (callback: (event: Record<string, unknown>) => void) => {
    runtime.callback = callback;
    return { stop: runtime.stop };
  }
}));
vi.mock('./syncGroupRuntimeInstance.js', () => ({ loadSyncGroupRuntimeInstanceId: () => 'runtime-local' }));

import { DesktopSyncGroupDiscoverySession } from './desktopSyncGroupDiscoverySession.js';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.callback = null;
});

function service(extra: Record<string, unknown> = {}) {
  return { addresses: ['192.168.0.12'], domain: 'local.', fqdn: 'daily._foliole-sync._tcp.local',
    host: 'daily.local.', interfaceIndex: 7, name: 'Daily', port: 38641,
    txt: { group_id: 'group-1', group_tag: 'tag-1', runtime_instance_id: 'remote' },
    type: '_foliole-sync._tcp', ...extra };
}

it('publishes found, changed, and lost until explicitly stopped', async () => {
  const snapshots: Array<{ change: string; status: string }> = [];
  const fetchDiscovery = vi.fn(async () => new Response(JSON.stringify({
    group_display_name: 'Daily Group', group_id: 'group-1', group_tag: 'tag-1',
    peer_id: 'device-a', provider_host_name: 'Mac', provider_host_platform: 'darwin',
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, timeline_id: 'timeline-1'
  })));
  const session = new DesktopSyncGroupDiscoverySession((snapshot: SyncGroupDiscoverySnapshot) => snapshots.push(snapshot), fetchDiscovery);
  const remote = service();

  session.start();
  runtime.callback?.({ kind: 'found', service: remote });
  await vi.waitFor(() => expect(snapshots.some(({ change }) => change === 'found')).toBe(true));
  runtime.callback?.({ kind: 'changed', service: remote });
  await vi.waitFor(() => expect(snapshots.some(({ change }) => change === 'changed')).toBe(true));
  runtime.callback?.({ kind: 'lost', service: remote });
  session.stop();

  expect(snapshots.map(({ change }) => change)).toEqual(['started', 'found', 'changed', 'lost', 'stopped']);
  expect(runtime.stop).toHaveBeenCalledOnce();
});

it('keeps incompatible and connection failures distinct from empty results', async () => {
  const snapshots: Array<{ status: string }> = [];
  const incompatible = new DesktopSyncGroupDiscoverySession((snapshot: SyncGroupDiscoverySnapshot) => snapshots.push(snapshot),
    vi.fn(async () => new Response(JSON.stringify({
      group_id: 'group-1', group_tag: 'tag-1', protocol: null
    }))));
  incompatible.start();
  runtime.callback?.({ kind: 'found', service: service({ fqdn: 'old', name: 'Old', port: 1 }) });
  await vi.waitFor(() => expect(snapshots.at(-1)?.status).toBe('incompatible'));

  incompatible.stop();
  expect(snapshots.some(({ status }) => status === 'searching')).toBe(true);
});

it('tries an advertised LAN address when the announcement source route is unreachable', async () => {
  const snapshots: SyncGroupDiscoverySnapshot[] = [];
  const fetchDiscovery = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('169.254.161.89')) throw new Error('unreachable route');
    return new Response(JSON.stringify({
      group_display_name: 'Daily Group', group_id: 'group-1', group_tag: 'tag-1',
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
    }));
  });
  const session = new DesktopSyncGroupDiscoverySession((snapshot) => snapshots.push(snapshot), fetchDiscovery);
  session.start();
  runtime.callback?.({ kind: 'found', service: service({ addresses: ['169.254.161.89'], fqdn: 'daily',
    txt: { group_id: 'group-1', group_tag: 'tag-1',
      ipv4_addresses: '192.168.0.10,169.254.161.89', runtime_instance_id: 'remote' } }) });

  await vi.waitFor(() => expect(snapshots.at(-1)?.status).toBe('results'));
  expect(snapshots.at(-1)?.candidates[0]?.endpoint_url).toBe('http://192.168.0.10:38641');
});
