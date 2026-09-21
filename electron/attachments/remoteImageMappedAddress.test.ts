// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { fetchRemoteImage } from './remoteImageFetchAttempt.js';

const ATTEMPT = { attempt: 1, sourceOrigin: null, strategy: 'direct' as const };
const PUBLIC_URL = 'https://example.com/image.png';
const BLOCKED_HOSTS = [
  '127.0.0.1', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]',
  '[0:0:0:0:0:FFFF:7F00:0001]', '[::ffff:a00:1]', '[::ffff:a9fe:a9fe]',
  '[::ffff:ac10:1]', '[::ffff:c0a8:101]', '[::ffff:6440:1]'
];

it.each(BLOCKED_HOSTS)('rejects direct requests to %s before transport', async (host) => {
  const transport = vi.fn(async () => new Response('unexpected'));
  await expect(fetchRemoteImage(`http://${host}/image.png`, ATTEMPT, transport))
    .rejects.toMatchObject({ name: 'RemoteImagePolicyError' });
  expect(transport).not.toHaveBeenCalled();
});

it.each(BLOCKED_HOSTS)('rejects a later redirect to %s before transport', async (host) => {
  const transport = vi.fn(async (url: string) => new Response(null, {
    status: 302,
    headers: { location: url === PUBLIC_URL ? '/next.png' : `http://${host}/image.png` }
  }));
  await expect(fetchRemoteImage(PUBLIC_URL, ATTEMPT, transport))
    .rejects.toMatchObject({ name: 'RemoteImagePolicyError' });
  expect(transport.mock.calls.map(([url]) => url)).toEqual([PUBLIC_URL, 'https://example.com/next.png']);
});

it.each(['https://example.com/public.png', 'http://[::ffff:808:808]/public.png'])(
  'allows public direct and redirected images at %s', async (target) => {
    const transport = vi.fn(async (url: string) => url === PUBLIC_URL
      ? new Response(null, { status: 302, headers: { location: target } })
      : new Response('image'));
    for (const url of [target, PUBLIC_URL]) {
      const fetched = await fetchRemoteImage(url, ATTEMPT, transport);
      try {
        expect(await fetched.response.text()).toBe('image');
      } finally {
        fetched.clearTimeout();
      }
    }
  }
);
