import { randomUUID } from 'node:crypto';

function relayDirectory(input: unknown): URL {
  if (typeof input !== 'string') throw new Error('Invalid WebDAV folder URL.');
  const url = URL.parse(input);
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid WebDAV folder URL.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

async function request(url: URL, method: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`WebDAV ${method} returned HTTP ${response.status}.`);
  }
  return response;
}

async function removeProbe(url: URL) {
  const response = await fetch(url, {
    method: 'DELETE',
    redirect: 'error',
    signal: AbortSignal.timeout(4000)
  });
  await response.body?.cancel();
  if (!response.ok && response.status !== 404) {
    throw new Error(`WebDAV DELETE returned HTTP ${response.status}.`);
  }
}

export async function testWebDavRelayConnection(input: unknown): Promise<string> {
  const directory = relayDirectory(input);
  const probe = randomUUID();
  const staging = new URL(`.foliole-test-${probe}.tmp`, directory);
  const published = new URL(`.foliole-test-${probe}.bin`, directory);
  const listing = await request(directory, 'PROPFIND', { headers: { Depth: '0' } });
  await listing.body?.cancel();

  try {
    const upload = await request(staging, 'PUT', { body: probe, headers: { 'If-None-Match': '*' } });
    await upload.body?.cancel();
    const move = await request(staging, 'MOVE', { headers: { Destination: published.href, Overwrite: 'F' } });
    await move.body?.cancel();
    const download = await request(published, 'GET', { headers: { Range: 'bytes=0-36' } });
    await verifyProbe(download, probe);
  } catch (error) {
    await Promise.allSettled([removeProbe(staging), removeProbe(published)]);
    throw error;
  }
  await removeProbe(published);
  return directory.href;
}

async function verifyProbe(response: Response, probe: string) {
  const expected = new TextEncoder().encode(probe);
  let offset = 0;
  for await (const chunk of response.body ?? []) {
    for (const byte of chunk) {
      if (byte !== expected[offset++]) throw new Error('WebDAV returned different test data.');
    }
  }
  if (offset !== expected.length) throw new Error('WebDAV returned incomplete test data.');
}
