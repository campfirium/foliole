import { beforeEach, describe, expect, it, vi } from 'vitest';

const bonjourMock = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
  constructorCallback: null as ((error: unknown) => void) | null,
  destroy: vi.fn(),
  networkInterfaces: vi.fn(),
  publish: vi.fn(),
  stop: vi.fn((callback?: () => void) => callback?.())
}));

vi.mock('node:os', () => ({
  default: {
    hostname: () => 'V',
    networkInterfaces: bonjourMock.networkInterfaces
  }
}));

vi.mock('./syncGroupRuntimeInstance.js', () => ({
  loadSyncGroupRuntimeInstanceId: () => 'runtime-desktop-v'
}));

vi.mock('bonjour-service', () => {
  class MockBonjour {
    constructor(options: unknown, callback: (error: unknown) => void) {
      bonjourMock.constructorOptions.push(options);
      bonjourMock.constructorCallback = callback;
    }

    publish(opts: unknown) {
      bonjourMock.publish(opts);
      return { stop: bonjourMock.stop };
    }

    destroy() {
      bonjourMock.destroy();
    }
  }
  return {
    Bonjour: MockBonjour,
    default: MockBonjour
  };
});

async function resetMocks() {
  const { stopCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');
  stopCompanionMdnsAdvertisement();
  bonjourMock.destroy.mockClear();
  bonjourMock.constructorOptions = [];
  bonjourMock.constructorCallback = null;
  bonjourMock.networkInterfaces.mockReset();
  bonjourMock.networkInterfaces.mockReturnValue({
    ethernet: [{ address: '192.168.0.11', family: 'IPv4', internal: false }]
  });
  bonjourMock.publish.mockClear();
  bonjourMock.stop.mockClear();
}

describe('companion mDNS advertisement', () => {
  beforeEach(resetMocks);

  it('reports responder warnings to the sync status owner', async () => {
    const onWarning = vi.fn();
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test',
      groupDisplayName: 'V',
      groupId: 'group-1',
      onWarning,
      peerId: 'desktop-local',
      port: 38683,
      timelineId: 'timeline-1'
    });
    bonjourMock.constructorCallback?.(new Error('multicast unavailable'));

    expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({ message: 'multicast unavailable' }));
  });

  it('publishes the Foliole sync service with peer metadata', async () => {
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test',
      groupDisplayName: 'V',
      groupId: 'group-1',
      peerId: 'desktop-local',
      port: 38683,
      timelineId: 'timeline-1'
    });

    expect(bonjourMock.constructorOptions).toEqual([{ interface: '192.168.0.11' }]);

    expect(bonjourMock.publish).toHaveBeenCalledWith({
      host: 'V-runtimed.local',
      name: 'V-runtimed',
      port: 38683,
      protocol: 'tcp',
      txt: {
        app_version: '0.1.0-test',
        facts_revision: expect.any(String),
        group_id: 'group-1',
        ipv4_addresses: '192.168.0.11',
        peer_id: 'desktop-local',
        protocol_capabilities: 'lan-sync-v1,sync-group-facts-v1',
        protocol_max_version: '1',
        protocol_min_version: '1',
        protocol_version: '1',
        runtime_instance_id: expect.any(String),
        timeline_id: 'timeline-1'
      },
      type: 'foliole-sync'
    });
  });

});

describe('companion mDNS facts hints', () => {
  beforeEach(resetMocks);

  it('re-advertises a newer transient facts revision after committed data changes', async () => {
    const { refreshCompanionMdnsAdvertisement, startCompanionMdnsAdvertisement } = await import(
      './companionMdnsAdvertisement.js'
    );
    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test', groupDisplayName: 'V', groupId: 'group-1',
      peerId: 'desktop-local', port: 38683, timelineId: 'timeline-1'
    });
    const initial = (bonjourMock.publish.mock.calls[0]?.[0] as { txt: { facts_revision: string } }).txt.facts_revision;
    await refreshCompanionMdnsAdvertisement();
    const refreshed = (bonjourMock.publish.mock.calls[1]?.[0] as { txt: { facts_revision: string } }).txt.facts_revision;
    expect(Number(refreshed)).toBe(Number(initial) + 1);
    expect(bonjourMock.stop).toHaveBeenCalledOnce();
  });

  it('waits for the old service goodbye before publishing its replacement', async () => {
    let finishGoodbye = () => {};
    bonjourMock.stop.mockImplementationOnce((callback?: () => void) => {
      finishGoodbye = () => callback?.();
    });
    const { refreshCompanionMdnsAdvertisement, startCompanionMdnsAdvertisement } = await import(
      './companionMdnsAdvertisement.js'
    );
    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test', groupDisplayName: 'V', groupId: 'group-1',
      peerId: 'desktop-local', port: 38683, timelineId: 'timeline-1'
    });

    const refreshed = refreshCompanionMdnsAdvertisement();
    await Promise.resolve();
    expect(bonjourMock.publish).toHaveBeenCalledTimes(1);
    finishGoodbye();
    await refreshed;
    expect(bonjourMock.publish).toHaveBeenCalledTimes(2);
  });

  it('keeps one device service identity stable while facts revisions change', async () => {
    const { refreshCompanionMdnsAdvertisement, startCompanionMdnsAdvertisement } = await import(
      './companionMdnsAdvertisement.js'
    );
    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test', groupDisplayName: 'Shared group', groupId: 'group-1',
      peerId: 'desktop-local', port: 38683, timelineId: 'timeline-1'
    });
    await refreshCompanionMdnsAdvertisement();

    expect(bonjourMock.publish.mock.calls.map(([input]) => (input as { name: string }).name))
      .toEqual(['Shared group-runtimed', 'Shared group-runtimed']);
  });
});

describe('companion mDNS routing', () => {
  beforeEach(resetMocks);

  it('separates SRV hosts when two desktops share one OS hostname', async () => {
    const { resolveCompanionMdnsHost } = await import('./companionMdnsAdvertisement.js');

    expect(resolveCompanionMdnsHost('Maci', 'aaaaaaaa-desktop-a'))
      .not.toBe(resolveCompanionMdnsHost('Maci', 'bbbbbbbb-desktop-c'));
  });

  it('publishes every external IPv4 route without loopback addresses', async () => {
    const { resolveCompanionMdnsIpv4Addresses } = await import('./companionMdnsAdvertisement.js');

    expect(resolveCompanionMdnsIpv4Addresses({
      ethernet: [
        { address: '192.168.0.11', cidr: '192.168.0.11/24', family: 'IPv4', internal: false,
          mac: '00:00:00:00:00:01', netmask: '255.255.255.0' },
        { address: '127.0.0.1', cidr: '127.0.0.1/8', family: 'IPv4', internal: true,
          mac: '00:00:00:00:00:00', netmask: '255.0.0.0' }
      ]
    })).toEqual(['192.168.0.11']);
  });
});

describe('companion mDNS lifecycle', () => {
  beforeEach(resetMocks);

  it('advertises once through the system multicast route', async () => {
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test', groupDisplayName: 'V', groupId: 'group-1',
      peerId: 'desktop-local', port: 38683, timelineId: 'timeline-1'
    });

    expect(bonjourMock.constructorOptions).toEqual([{ interface: '192.168.0.11' }]);
    expect(bonjourMock.publish).toHaveBeenCalledTimes(1);
  });

  it('advertises on every external IPv4 interface', async () => {
    bonjourMock.networkInterfaces.mockReturnValue({
      ethernet: [{ address: '192.168.0.11', family: 'IPv4', internal: false }],
      vpn: [{ address: '198.18.0.1', family: 'IPv4', internal: false }]
    });
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test', groupDisplayName: 'V', groupId: 'group-1',
      peerId: 'desktop-local', port: 38683, timelineId: 'timeline-1'
    });

    expect(bonjourMock.constructorOptions).toEqual([
      { interface: '192.168.0.11' }, { interface: '198.18.0.1' }
    ]);
    expect(bonjourMock.publish).toHaveBeenCalledTimes(2);
  });

  it('stops the advertised service and destroys the responder', async () => {
    const { startCompanionMdnsAdvertisement, stopCompanionMdnsAdvertisement } = await import(
      './companionMdnsAdvertisement.js'
    );

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test',
      groupDisplayName: 'V',
      groupId: 'group-1',
      peerId: 'desktop-local',
      port: 38683,
      timelineId: 'timeline-1'
    });
    stopCompanionMdnsAdvertisement();

    expect(bonjourMock.stop).toHaveBeenCalledTimes(1);
    expect(bonjourMock.destroy).toHaveBeenCalledTimes(1);
  });
});
