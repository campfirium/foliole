import { beforeEach, describe, expect, it, vi } from 'vitest';

const bonjourMock = vi.hoisted(() => ({
  constructorCallback: null as ((error: unknown) => void) | null,
  destroy: vi.fn(),
  publish: vi.fn(),
  stop: vi.fn()
}));

vi.mock('bonjour-service', () => {
  class MockBonjour {
    constructor(_options: unknown, callback: (error: unknown) => void) {
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

describe('companion mDNS advertisement', () => {
  beforeEach(async () => {
    const { stopCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');
    stopCompanionMdnsAdvertisement();
    bonjourMock.destroy.mockClear();
    bonjourMock.constructorCallback = null;
    bonjourMock.publish.mockClear();
    bonjourMock.stop.mockClear();
  });

  it('reports responder warnings to the sync status owner', async () => {
    const onWarning = vi.fn();
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test',
      onWarning,
      peerId: 'desktop-local',
      port: 38683
    });
    bonjourMock.constructorCallback?.(new Error('multicast unavailable'));

    expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({ message: 'multicast unavailable' }));
  });

  it('publishes the Foliole sync service with peer metadata', async () => {
    const { startCompanionMdnsAdvertisement } = await import('./companionMdnsAdvertisement.js');

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local',
      port: 38683
    });

    expect(bonjourMock.publish).toHaveBeenCalledWith({
      name: 'Foliole Desktop',
      port: 38683,
      protocol: 'tcp',
      txt: {
        app_version: '0.1.0-test',
        peer_id: 'desktop-local',
        protocol_capabilities: 'lan-sync-v1',
        protocol_max_version: '1',
        protocol_min_version: '1',
        protocol_version: '1'
      },
      type: 'foliole-sync'
    });
  });

  it('stops the advertised service and destroys the responder', async () => {
    const { startCompanionMdnsAdvertisement, stopCompanionMdnsAdvertisement } = await import(
      './companionMdnsAdvertisement.js'
    );

    startCompanionMdnsAdvertisement({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local',
      port: 38683
    });
    stopCompanionMdnsAdvertisement();

    expect(bonjourMock.stop).toHaveBeenCalledTimes(1);
    expect(bonjourMock.destroy).toHaveBeenCalledTimes(1);
  });
});
