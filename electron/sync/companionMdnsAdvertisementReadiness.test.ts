import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { waitForCompanionMdnsAdvertisement } from './companionMdnsAdvertisement.js';

class PublishedServiceStub extends EventEmitter {
  published = false;
}

describe('companion mDNS advertisement readiness', () => {
  it('waits for every service to publish before reporting the provider ready', async () => {
    const first = new PublishedServiceStub();
    const second = new PublishedServiceStub();
    const ready = waitForCompanionMdnsAdvertisement([first, second] as never, 100);
    first.emit('up');
    let settled = false;
    void ready.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    second.emit('up');
    await expect(ready).resolves.toBeUndefined();
  });

  it('fails readiness when publication reports an error', async () => {
    const service = new PublishedServiceStub();
    const ready = waitForCompanionMdnsAdvertisement([service] as never, 100);
    service.emit('error', new Error('multicast unavailable'));
    await expect(ready).rejects.toThrow('multicast unavailable');
  });
});
