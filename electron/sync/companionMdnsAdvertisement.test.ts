import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  callbacks: [] as Array<(event: Record<string, unknown>) => void>,
  cancel: vi.fn(),
  networkInterfaces: vi.fn(),
  register: vi.fn()
}));

vi.mock('node:os', () => ({
  default: { networkInterfaces: runtime.networkInterfaces }
}));
vi.mock('@foliole/desktop-dnssd', () => ({
  register: (input: unknown, callback: (event: Record<string, unknown>) => void) => {
    runtime.register(input);
    runtime.callbacks.push(callback);
    return { cancel: runtime.cancel, stop: runtime.cancel };
  }
}));
vi.mock('./syncGroupRuntimeInstance.js', () => ({
  loadSyncGroupRuntimeInstanceId: () => 'runtime-desktop-v'
}));

import {
  recoverCompanionMdnsAdvertisement,
  startCompanionMdnsAdvertisement,
  stopCompanionMdnsAdvertisement,
  updateCompanionMdnsAdvertisementRole
} from './companionMdnsAdvertisement.js';

const input = {
  appVersion: '0.1.0-test', deviceId: 'desktop-local', groupDisplayName: 'V',
  groupId: 'group-1', groupTag: 'tag-1', port: 38683, role: 'observing' as const
};

beforeEach(() => {
  stopCompanionMdnsAdvertisement();
  vi.clearAllMocks();
  runtime.callbacks = [];
  runtime.networkInterfaces.mockReturnValue({
    ethernet: [{ address: '192.168.0.11', family: 'IPv4', internal: false }]
  });
});

afterEach(() => {
  stopCompanionMdnsAdvertisement();
  vi.useRealTimers();
});

describe('desktop OS DNS-SD advertisement', () => {
  it('registers one system service with the existing service and TXT contract', async () => {
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;

    expect(runtime.register).toHaveBeenCalledOnce();
    expect(runtime.register).toHaveBeenCalledWith({
      domain: 'local.', name: 'V-runtimed-observing',
      port: 38683, type: '_foliole-sync._tcp',
      txt: { app_version: '0.1.0-test', device_id: 'desktop-local',
        group_id: 'group-1', group_tag: 'tag-1', provider_platform: process.platform,
        ipv4_addresses: '192.168.0.11', runtime_instance_id: 'runtime-desktop-v',
        topology_role: 'observing',
        ...serializeSyncProtocolTxt() }
    });
  });

  it('fails closed and withdraws registration when the host reports an error', async () => {
    const onWarning = vi.fn();
    const ready = startCompanionMdnsAdvertisement({ ...input, onWarning });
    runtime.callbacks[0]?.({ code: 'desktop_dnssd_register_failed', kind: 'error',
      message: 'host unavailable' });

    await expect(ready).rejects.toThrow('desktop_dnssd_register_failed');
    expect(onWarning).toHaveBeenCalledOnce();
    expect(runtime.cancel).toHaveBeenCalledOnce();
  });
});

describe('desktop OS DNS-SD advertisement recovery', () => {
  it('re-registers after a registered service fails without restarting the app', async () => {
    vi.useFakeTimers();
    const onWarning = vi.fn();
    const onRecovered = vi.fn();
    const ready = startCompanionMdnsAdvertisement({ ...input, onWarning, onRecovered });
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;

    runtime.callbacks[0]?.({ code: 'desktop_dnssd_register_failed', kind: 'error',
      message: 'network changed' });
    expect(runtime.cancel).toHaveBeenCalledOnce();
    expect(onWarning).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runtime.register).toHaveBeenCalledTimes(2);
    runtime.callbacks[1]?.({ kind: 'registered', service: {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(onRecovered).toHaveBeenCalledOnce();
  });

  it('does not re-register a failed service after synchronization stops', async () => {
    vi.useFakeTimers();
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;
    runtime.callbacks[0]?.({ code: 'desktop_dnssd_register_failed', kind: 'error',
      message: 'network changed' });

    stopCompanionMdnsAdvertisement();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runtime.register).toHaveBeenCalledOnce();
  });

  it('uses the latest topology role when retrying a failed registration', async () => {
    vi.useFakeTimers();
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;
    runtime.callbacks[0]?.({ code: 'desktop_dnssd_register_failed', kind: 'error',
      message: 'network changed' });
    await updateCompanionMdnsAdvertisementRole('anchor');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(runtime.register.mock.calls[1]?.[0]).toMatchObject({
      txt: expect.objectContaining({ topology_role: 'anchor' })
    });
  });

  it('limits retries when the system keeps rejecting registration', async () => {
    vi.useFakeTimers();
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;
    runtime.callbacks[0]?.({ code: 'desktop_dnssd_register_failed', kind: 'error',
      message: 'network changed' });
    for (const [index, delay] of [1_000, 3_000, 10_000].entries()) {
      await vi.advanceTimersByTimeAsync(delay);
      runtime.callbacks[index + 1]?.({ code: 'desktop_dnssd_register_failed', kind: 'error',
        message: 'host unavailable' });
      await vi.advanceTimersByTimeAsync(0);
    }
    await vi.advanceTimersByTimeAsync(30_000);

    expect(runtime.register).toHaveBeenCalledTimes(4);
  });
});

it('allows a later user or network recovery to retry exhausted publication', async () => {
  vi.useFakeTimers();
  const ready = startCompanionMdnsAdvertisement(input);
  runtime.callbacks[0]?.({ kind: 'registered', service: {} });
  await ready;
  runtime.callbacks[0]?.({ code: 'desktop_dnssd_register_failed', kind: 'error',
    message: 'network changed' });
  for (const [index, delay] of [1_000, 3_000, 10_000].entries()) {
    await vi.advanceTimersByTimeAsync(delay);
    runtime.callbacks[index + 1]?.({ code: 'desktop_dnssd_register_failed', kind: 'error',
      message: 'host unavailable' });
    await vi.advanceTimersByTimeAsync(0);
  }
  recoverCompanionMdnsAdvertisement();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(runtime.register).toHaveBeenCalledTimes(5);
});

describe('desktop OS DNS-SD advertisement roles and stop', () => {
  it('withdraws the old registration only when the topology role changes', async () => {
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;
    const refreshed = updateCompanionMdnsAdvertisementRole('anchor');
    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledTimes(2));
    runtime.callbacks[1]?.({ kind: 'registered', service: {} });
    await refreshed;

    expect(runtime.register.mock.calls[1]?.[0]).toMatchObject({
      name: 'V-runtimed-anchor',
      txt: expect.objectContaining({ topology_role: 'anchor' })
    });
    expect(runtime.cancel).toHaveBeenCalledOnce();
  });

  it('does not rebuild the provider when the topology role is unchanged', async () => {
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;
    await updateCompanionMdnsAdvertisementRole('observing');

    expect(runtime.register).toHaveBeenCalledOnce();
    expect(runtime.cancel).not.toHaveBeenCalled();
  });

  it('cancels exactly the active system registration when stopped', async () => {
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;
    stopCompanionMdnsAdvertisement();
    stopCompanionMdnsAdvertisement();

    expect(runtime.cancel).toHaveBeenCalledOnce();
  });
});
