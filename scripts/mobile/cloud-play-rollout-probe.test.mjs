// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { availabilityFixture } from '../android/play-availability-test-fixture.mjs';
import { cloudPlayReadToken, probePlayRollout } from './cloud-play-rollout-probe.mjs';

it('exchanges the runtime identity for a short-lived Play token for the dedicated reader', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'workload-token' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: 'play-token' }) });
  await expect(cloudPlayReadToken(fetch)).resolves.toBe('play-token');
  expect(fetch.mock.calls[0][1].headers).toEqual({ 'Metadata-Flavor': 'Google' });
  const [url, request] = fetch.mock.calls[1];
  expect(url).toContain('foliole-play-read-probe@foliole-play-distribution.iam.gserviceaccount.com');
  expect(request.headers.authorization).toBe('Bearer workload-token');
  expect(JSON.parse(request.body)).toEqual({
    scope: ['https://www.googleapis.com/auth/androidpublisher'], lifetime: '600s'
  });
});

it('confirms only an exact full rollout and discards each temporary Play edit', async () => {
  const fixture = await availabilityFixture();
  try {
    const { play, registration } = fixture.clients();
    const verify = () => probePlayRollout(play, registration.payload.candidate);
    await expect(verify()).resolves.toBe(false);
    expect(fixture.calls.some(call => call.method === 'POST')).toBe(false);
    fixture.lifecycle = 'PUBLISHED';
    fixture.track.releases[0].status = 'halted';
    await expect(verify()).resolves.toBe(false);
    fixture.track.releases[0].status = 'completed';
    await expect(verify()).resolves.toBe(true);
    fixture.changeDuringRead = true;
    await expect(verify()).resolves.toBe(false);
    fixture.failTrack = true;
    fixture.lifecycle = 'PUBLISHED';
    await expect(verify()).rejects.toThrow('HTTP 403');
    expect(fixture.edits.size).toBe(0);
    expect(fixture.calls.filter(call => call.method === 'POST').every(call => call.route.endsWith('/edits'))).toBe(true);
  } finally {
    await fixture.close();
  }
});
