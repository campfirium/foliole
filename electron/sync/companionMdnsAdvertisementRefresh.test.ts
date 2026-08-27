import { expect, it, vi } from 'vitest';

const bonjourMock = vi.hoisted(() => ({
  publish: vi.fn(),
  stop: vi.fn(() => undefined)
}));

vi.mock('node:os', () => ({
  default: {
    hostname: () => 'V',
    networkInterfaces: () => ({
      ethernet: [{ address: '192.168.0.11', family: 'IPv4', internal: false }]
    })
  }
}));

vi.mock('./syncGroupRuntimeInstance.js', () => ({
  loadSyncGroupRuntimeInstanceId: () => 'runtime-desktop-v'
}));

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    publish(options: unknown) {
      bonjourMock.publish(options);
      return { stop: bonjourMock.stop };
    }
    destroy() { /* The refresh keeps its responder alive. */ }
  }
}));

it('re-advertises when the responder does not finish its goodbye callback', async () => {
  vi.useFakeTimers();
  try {
    const { refreshCompanionMdnsAdvertisement, startCompanionMdnsAdvertisement } = await import(
      './companionMdnsAdvertisement.js'
    );
    startCompanionMdnsAdvertisement({ appVersion: '0.1.0-test', groupDisplayName: 'V',
      groupId: 'group-1', groupTag: 'tag-1', deviceId: 'desktop-local', port: 38683 });

    const refreshed = refreshCompanionMdnsAdvertisement();
    await vi.advanceTimersByTimeAsync(1_000);
    await refreshed;

    expect(bonjourMock.publish).toHaveBeenCalledTimes(2);
    expect(bonjourMock.publish).toHaveBeenLastCalledWith(expect.objectContaining({ probe: false }));
  } finally { vi.useRealTimers(); }
});
