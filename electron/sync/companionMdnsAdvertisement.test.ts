import { beforeEach, describe, expect, it, vi } from 'vitest';

const bonjourMock = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
  constructorCallback: null as ((error: unknown) => void) | null,
  destroy: vi.fn(),
  publish: vi.fn(),
  stop: vi.fn()
}));

vi.mock('node:os', () => ({
  default: { hostname: () => 'V' }
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

    expect(bonjourMock.constructorOptions).toEqual([undefined]);

    expect(bonjourMock.publish).toHaveBeenCalledWith({
      host: 'V.local',
      name: 'V',
      port: 38683,
      protocol: 'tcp',
      txt: {
        app_version: '0.1.0-test',
        group_id: 'group-1',
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

describe('companion mDNS lifecycle', () => {
  beforeEach(resetMocks);

  it('advertises once through the system multicast route', async () => {
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test', groupDisplayName: 'V', groupId: 'group-1',
      peerId: 'desktop-local', port: 38683, timelineId: 'timeline-1'
    });

    expect(bonjourMock.constructorOptions).toEqual([undefined]);
    expect(bonjourMock.publish).toHaveBeenCalledTimes(1);
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
