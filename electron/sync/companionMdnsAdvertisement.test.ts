import { beforeEach, describe, expect, it, vi } from 'vitest';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  callbacks: [] as Array<(event: Record<string, unknown>) => void>,
  networkInterfaces: vi.fn(),
  register: vi.fn(),
  stop: vi.fn()
}));

vi.mock('node:os', () => ({
  default: { hostname: () => 'V', networkInterfaces: runtime.networkInterfaces }
}));
vi.mock('./syncGroupRuntimeInstance.js', () => ({
  loadSyncGroupRuntimeInstanceId: () => 'runtime-desktop-v'
}));
vi.mock('./desktopDnsSd.js', () => ({
  startDesktopDnsSdRegistration: (input: unknown, callback: (event: Record<string, unknown>) => void) => {
    runtime.register(input);
    runtime.callbacks.push(callback);
    return { stop: runtime.stop };
  }
}));

async function resetRuntime() {
  const { stopCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');
  await stopCompanionMdnsAdvertisement();
  vi.clearAllMocks();
  runtime.callbacks = [];
  runtime.networkInterfaces.mockReturnValue({
    ethernet: [{ address: '192.168.0.11', family: 'IPv4', internal: false }]
  });
}

function input(onWarning?: (error: unknown) => void) {
  return { appVersion: '0.1.0-test', groupDisplayName: 'V', groupId: 'group-1',
    groupTag: 'tag-1', deviceId: 'desktop-local', port: 38683,
    ...(onWarning ? { onWarning } : {}) };
}

describe('desktop DNS-SD advertisement', () => {
  beforeEach(resetRuntime);

  it('registers one OS-owned service with the existing TXT contract', async () => {
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');
    const advertisement = startCompanionMdnsAdvertisement(input());
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });

    await expect(advertisement.ready).resolves.toBeUndefined();
    expect(runtime.register).toHaveBeenCalledOnce();
    expect(runtime.register).toHaveBeenCalledWith({
      name: expect.stringMatching(/^V-runtimed-r[0-9a-z]+$/u),
      port: 38683,
      txt: {
        app_version: '0.1.0-test', device_id: 'desktop-local', facts_revision: expect.any(String),
        group_id: 'group-1', group_tag: 'tag-1', ipv4_addresses: '192.168.0.11',
        runtime_instance_id: 'runtime-desktop-v', ...serializeSyncProtocolTxt()
      }
    });
  });

  it('fails closed when the OS registration reports unavailable', async () => {
    const onWarning = vi.fn();
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');
    const advertisement = startCompanionMdnsAdvertisement(input(onWarning));
    runtime.callbacks[0]?.({ code: 'desktop_dnssd_register_failed', kind: 'error', message: '55' });

    await expect(advertisement.ready).rejects.toThrow('desktop_dnssd_register_failed: 55');
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it('withdraws before registering a new facts revision and stops idempotently', async () => {
    const { refreshCompanionMdnsAdvertisement, startCompanionMdnsAdvertisement,
      stopCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');
    startCompanionMdnsAdvertisement(input());
    const initial = runtime.register.mock.calls[0]?.[0] as { name: string; txt: { facts_revision: string } };
    const refreshed = refreshCompanionMdnsAdvertisement();
    await Promise.resolve();
    runtime.callbacks[1]?.({ kind: 'registered', service: {} });
    await refreshed;
    const next = runtime.register.mock.calls[1]?.[0] as { name: string; txt: { facts_revision: string } };

    expect(runtime.stop).toHaveBeenCalledOnce();
    expect(Number(next.txt.facts_revision)).toBe(Number(initial.txt.facts_revision) + 1);
    expect(next.name).not.toBe(initial.name);
    await stopCompanionMdnsAdvertisement();
    await stopCompanionMdnsAdvertisement();
    expect(runtime.stop).toHaveBeenCalledTimes(2);
  });
});

describe('desktop DNS-SD transient route facts', () => {
  beforeEach(resetRuntime);

  it('keeps all external IPv4 hints out of permanent state', async () => {
    const { resolveCompanionMdnsIpv4Addresses } = await import('./companionMdnsAdvertisement.js');
    expect(resolveCompanionMdnsIpv4Addresses({ ethernet: [
      { address: '192.168.0.11', cidr: '192.168.0.11/24', family: 'IPv4', internal: false,
        mac: '00:00:00:00:00:01', netmask: '255.255.255.0' },
      { address: '127.0.0.1', cidr: '127.0.0.1/8', family: 'IPv4', internal: true,
        mac: '00:00:00:00:00:00', netmask: '255.0.0.0' }
    ] })).toEqual(['192.168.0.11']);
  });
});
