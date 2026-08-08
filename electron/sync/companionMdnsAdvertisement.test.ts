import { beforeEach, describe, expect, it, vi } from 'vitest';

const bonjourMock = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
  constructorCallback: null as ((error: unknown) => void) | null,
  destroy: vi.fn(),
  publish: vi.fn(),
  stop: vi.fn()
}));

const networkInterfacesMock = vi.hoisted(() => vi.fn());

vi.mock('node:os', () => ({
  default: { hostname: () => 'V', networkInterfaces: networkInterfacesMock }
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
  bonjourMock.publish.mockClear();
  bonjourMock.stop.mockClear();
  networkInterfacesMock.mockReturnValue({
    Ethernet: [{ address: '192.168.0.11', family: 'IPv4', internal: false, mac: '54:05:db:6a:f6:31' }]
  });
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
      host: 'V.local',
      name: 'V',
      port: 38683,
      protocol: 'tcp',
      txt: {
        app_version: '0.1.0-test',
        group_id: 'group-1',
        peer_id: 'desktop-local',
        protocol_capabilities: 'lan-sync-v1',
        protocol_max_version: '1',
        protocol_min_version: '1',
        protocol_version: '1',
        timeline_id: 'timeline-1'
      },
      type: 'foliole-sync'
    });
  });
});

describe('companion mDNS interface lifecycle', () => {
  beforeEach(resetMocks);

  it('advertises on every usable IPv4 interface instead of the system multicast route', async () => {
    networkInterfacesMock.mockReturnValue({
      Ethernet: [{ address: '192.168.0.11', family: 'IPv4', internal: false, mac: '54:05:db:6a:f6:31' }],
      Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true, mac: '00:00:00:00:00:00' }],
      Tunnel: [{ address: '198.18.0.1', family: 'IPv4', internal: false, mac: '00:00:00:00:00:00' }],
      VMware: [{ address: '192.168.111.1', family: 'IPv4', internal: false, mac: '00:50:56:c0:00:08' }]
    });
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test', groupDisplayName: 'V', groupId: 'group-1',
      peerId: 'desktop-local', port: 38683, timelineId: 'timeline-1'
    });

    expect(bonjourMock.constructorOptions).toEqual([
      { interface: '192.168.0.11' },
      { interface: '192.168.111.1' }
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
