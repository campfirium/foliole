// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { webDavRelayStatus } from '../../lib/core/sync/webDavRelayPublication.js';

import { createDesktopWebDavRelayHttp } from './desktopWebDavRelayHttp.js';
import { loadDesktopWebDavUsage, recordDesktopWebDavUsage } from './desktopWebDavUsage.js';

let root: string;
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_config_dir: root }) }));

const minute = 60_000;

async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected an HTTP address.');
  return (route: string) => new URL(route, `http://127.0.0.1:${address.port}`);
}

function usageServer(crossWindow: () => void) {
  let receivedUpload = 0;
  const server = createServer(async (request, response) => {
    if (request.url === '/crosses-window') {
      crossWindow();
      return response.writeHead(207).end('listing');
    }
    if (request.url === '/no-response') return request.socket.destroy();
    for await (const chunk of request) receivedUpload += chunk.length;
    if (request.url === '/error') return response.writeHead(403).end('denied');
    if (request.url === '/interrupted') {
      return response.writeHead(200, { 'Content-Length': '100' }).write('partial');
    }
    return response.writeHead(200).end('result');
  });
  return { server, uploaded: () => receivedUpload };
}

it('measures real request bodies, including failed attempts and retries, in rolling completion-time windows', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-webdav-usage-'));
  const now = 100 * minute;
  const clock = vi.spyOn(Date, 'now');
  const { server, uploaded } = usageServer(() => { clock.mockReturnValue(now - 9 * minute); });
  const url = await listen(server);
  const stats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const http = createDesktopWebDavRelayHttp(stats, undefined, { recordUsage: recordDesktopWebDavUsage });
  try {
    clock.mockReturnValue(now - 60 * minute);
    await http(url('/expired'), { method: 'GET' }, webDavRelayStatus);
    clock.mockReturnValue(now - 30 * minute);
    await http(url('/hour-only'), { method: 'GET' }, webDavRelayStatus);
    clock.mockReturnValue(now - 10 * minute);
    await http(url('/half-hour-only'), { method: 'GET' }, webDavRelayStatus);
    clock.mockReturnValue(now - 11 * minute);
    await http(url('/crosses-window'), { method: 'PROPFIND' }, webDavRelayStatus);

    clock.mockReturnValue(now);
    const payload = Buffer.from('upload');
    await expect(http(url('/error'), {
      method: 'PUT', body: { bytes: payload.length, async *chunks() { yield payload; } }
    }, webDavRelayStatus)).resolves.toBe(403);
    expect(uploaded()).toBe(payload.length);

    await expect(http(url('/interrupted'), { method: 'GET' }, async (_status, body) => {
      for await (const chunk of body) {
        expect(Buffer.from(chunk).toString()).toBe('partial');
        server.closeAllConnections();
      }
    })).rejects.toThrow();
    await Promise.all([
      http(url('/interrupted-retry'), { method: 'GET' }, webDavRelayStatus),
      expect(http(url('/no-response'), { method: 'GET' }, webDavRelayStatus)).rejects.toThrow()
    ]);

    await expect(loadDesktopWebDavUsage()).resolves.toEqual({
      measuredAt: now,
      tenMinutes: { requests: 5, uploadedBytes: 6, downloadedBytes: 26 },
      halfHour: { requests: 6, uploadedBytes: 6, downloadedBytes: 32 },
      hour: { requests: 7, uploadedBytes: 6, downloadedBytes: 38 }
    });
    clock.mockReturnValue(now + 60 * minute);
    await expect(loadDesktopWebDavUsage()).resolves.toMatchObject({
      hour: { requests: 0, uploadedBytes: 0, downloadedBytes: 0 }
    });
  } finally {
    clock.mockRestore();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
});
