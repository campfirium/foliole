import { beforeEach, expect, it, vi } from 'vitest';

import type { SyncGroupDiscoverySnapshot } from '../../lib/platform/syncGroupDiscoveryContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  destroy: vi.fn(),
  handlers: new Map<string, (service: Record<string, unknown>) => void>(),
  stop: vi.fn(),
  update: vi.fn()
}));

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    destroy() { runtime.destroy(); }
    find() {
      return {
        on(name: string, handler: (service: Record<string, unknown>) => void) {
          runtime.handlers.set(name, handler);
          return this;
        },
        stop: runtime.stop,
        update: runtime.update
      };
    }
  }
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({ resolveCompanionMdnsIpv4Addresses: () => [] }));
vi.mock('./syncGroupRuntimeInstance.js', () => ({ loadSyncGroupRuntimeInstanceId: () => 'runtime-local' }));

import { DesktopSyncGroupDiscoverySession } from './desktopSyncGroupDiscoverySession.js';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.handlers.clear();
  runtime.update.mockClear();
});

it('publishes found, changed, and lost until explicitly stopped', async () => {
  const snapshots: Array<{ change: string; status: string }> = [];
  const fetchDiscovery = vi.fn(async () => new Response(JSON.stringify({
    group_display_name: 'Daily Group', group_id: 'group-1', group_tag: 'tag-1',
    peer_id: 'device-a', provider_host_name: 'Mac', provider_host_platform: 'darwin',
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, timeline_id: 'timeline-1'
  })));
  const session = new DesktopSyncGroupDiscoverySession((snapshot: SyncGroupDiscoverySnapshot) => snapshots.push(snapshot), fetchDiscovery);
  const service = { addresses: ['192.168.0.12'], fqdn: 'daily._foliole-sync._tcp.local', name: 'Daily', port: 38641,
    txt: { group_id: 'group-1', group_tag: 'tag-1', runtime_instance_id: 'remote' } };

  session.start();
  runtime.handlers.get('up')?.(service);
  await vi.waitFor(() => expect(snapshots.some(({ change }) => change === 'found')).toBe(true));
  runtime.handlers.get('txt-update')?.(service);
  await vi.waitFor(() => expect(snapshots.some(({ change }) => change === 'changed')).toBe(true));
  runtime.handlers.get('down')?.(service);
  session.stop();

  expect(snapshots.map(({ change }) => change)).toEqual(['started', 'found', 'changed', 'lost', 'stopped']);
  expect(runtime.stop).toHaveBeenCalledOnce();
  expect(runtime.destroy).toHaveBeenCalledOnce();
});

it('keeps incompatible and connection failures distinct from empty results', async () => {
  const snapshots: Array<{ status: string }> = [];
  const incompatible = new DesktopSyncGroupDiscoverySession((snapshot: SyncGroupDiscoverySnapshot) => snapshots.push(snapshot),
    vi.fn(async () => new Response(JSON.stringify({
      group_id: 'group-1', group_tag: 'tag-1', protocol: null
    }))));
  incompatible.start();
  runtime.handlers.get('up')?.({ addresses: ['192.168.0.12'], fqdn: 'old', name: 'Old', port: 1,
    txt: { group_id: 'group-1', group_tag: 'tag-1', runtime_instance_id: 'remote' } });
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
  runtime.handlers.get('up')?.({ addresses: ['169.254.161.89'], fqdn: 'daily', name: 'Daily', port: 38641,
    referer: { address: '169.254.161.89' }, txt: { group_id: 'group-1', group_tag: 'tag-1',
      ipv4_addresses: '192.168.0.10,169.254.161.89', runtime_instance_id: 'remote' } });

  await vi.waitFor(() => expect(snapshots.at(-1)?.status).toBe('results'));
  expect(snapshots.at(-1)?.candidates[0]?.endpoint_url).toBe('http://192.168.0.10:38641');
});
