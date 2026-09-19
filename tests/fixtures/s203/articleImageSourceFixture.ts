import { isAllowedRemoteImageHostname } from '../../../lib/platform/remoteImageUrlGuard';

import { createArticleImageFixture, type ImageCase } from './articleImageFixture';

/** A bounded HTTP response fixture; it never opens a listener or changes TLS policy. */
export function createArticleImageSourceFixture(baseUrl: string, scenario: ImageCase) {
  const origin = new URL(baseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      !isAllowedRemoteImageHostname(origin.hostname)) throw new Error('Fixture origin violates production image URL policy');
  const fixture = createArticleImageFixture(baseUrl, scenario);
  const requests: Array<{ method: string; url: string; status: number }> = [];
  return {
    fixture,
    snapshot: () => requests.map((request) => ({ ...request })),
    respond(input: string | URL | Request) {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      if (url.origin !== origin.origin || url.href !== fixture.sourceUrl || request.method !== 'GET') {
        throw new Error('Request is outside the isolated image fixture contract');
      }
      requests.push({ method: request.method, url: url.href, status: fixture.response.status });
      return new Response(fixture.response.status === 200 ? Uint8Array.from(fixture.response.bytes) : null, {
        status: fixture.response.status,
        headers: { 'content-type': 'image/png', 'cache-control': 'no-store' }
      });
    }
  };
}
