import { randomUUID } from 'node:crypto';

import { webDavRelayStatus, type WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';
import { WebDavServiceBusyError } from '../../lib/core/sync/webDavRetryAfter.js';

import { createDesktopWebDavRelayHttp, type DesktopWebDavRelayHttpStats } from './desktopWebDavRelayHttp.js';
import { recordDesktopWebDavRelayLog } from './desktopWebDavRelayLog.js';

function relayDirectory(input: unknown): URL {
  if (typeof input !== 'string') throw new Error('Invalid WebDAV folder URL.');
  const url = URL.parse(input);
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid WebDAV folder URL.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function probeRequest(http: WebDavRelayRequest): WebDavRelayRequest {
  return async (url, input, receive) => {
    try {
      return await http(url, input, async (status, body) => {
        if ((status >= 200 && status < 300) || (input.method === 'DELETE' && status === 404)) return receive(status, body);
        await webDavRelayStatus(status, body);
        throw new Error(`WebDAV ${input.method} returned HTTP ${status}.`);
      });
    } catch (error) {
      if (error instanceof WebDavServiceBusyError) throw new Error(`WebDAV ${input.method} returned HTTP ${error.status}.`, { cause: error });
      throw error;
    }
  };
}

export async function testWebDavRelayConnection(input: unknown): Promise<string> {
  const stats: DesktopWebDavRelayHttpStats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0, httpStatuses: {} };
  const started = performance.now();
  let completed = false;
  try {
    const directory = relayDirectory(input);
    const http = createDesktopWebDavRelayHttp(stats, undefined, { timeoutMs: 4000 });
    await probeDirectory(directory, probeRequest(http));
    completed = true;
    return directory.href;
  } finally {
    await recordDesktopWebDavRelayLog('connection_test', stats, {
      status: completed ? 'completed' : 'failed', elapsedMs: Math.round(performance.now() - started),
      published: 0, applied: 0, retries: 0, retryable: false
    });
  }
}

async function probeDirectory(directory: URL, request: WebDavRelayRequest) {
  const probe = Buffer.from(randomUUID());
  const staging = new URL(`.foliole-test-${probe}.tmp`, directory);
  const published = new URL(`.foliole-test-${probe}.bin`, directory);
  const removeProbe = (url: URL) => request(url, { method: 'DELETE' }, webDavRelayStatus);
  await request(directory, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus);

  try {
    await request(staging, { method: 'PUT', headers: { 'If-None-Match': '*' },
      body: { bytes: probe.length, async *chunks() { yield probe; } } }, webDavRelayStatus);
    await request(staging, { method: 'MOVE', headers: { Destination: published.href, Overwrite: 'F' } }, webDavRelayStatus);
    await request(published, { method: 'GET', headers: { Range: 'bytes=0-36' } },
      (_status, body) => verifyProbe(body, probe));
  } catch (error) {
    await Promise.allSettled([removeProbe(staging), removeProbe(published)]);
    throw error;
  }
  await removeProbe(published);
}

async function verifyProbe(body: AsyncIterable<Uint8Array>, expected: Uint8Array) {
  let offset = 0;
  for await (const chunk of body) {
    for (const byte of chunk) {
      if (byte !== expected[offset++]) throw new Error('WebDAV returned different test data.');
    }
  }
  if (offset !== expected.length) throw new Error('WebDAV returned incomplete test data.');
}
