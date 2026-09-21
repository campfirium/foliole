import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';

async function installImageEndpoints(app: ElectronApplication) {
  return app.evaluate(async ({ session }) => {
    const moduleApi = process.getBuiltinModule('module');
    const require = moduleApi.createRequire(`${process.cwd()}/package.json`);
    const http = require('node:http');
    const state = { hits: 0, publicRequests: [] as string[], server: null as unknown as Server };
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    state.server = http.createServer((_request, response) => {
      state.hits += 1;
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(png);
    });
    await new Promise<void>((resolve) => state.server.listen(0, '127.0.0.1', resolve));
    const port = (state.server.address() as AddressInfo).port;
    globalThis.__t228Endpoints = state;
    session.defaultSession.protocol.handle('https', (request) => {
      const url = new URL(request.url);
      if (url.hostname !== 't228.example.com') return new Response(null, { status: 404 });
      state.publicRequests.push(url.pathname);
      if (url.pathname === '/redirect.png') {
        return new Response(null, {
          status: 302, headers: { location: `http://[::ffff:7f00:1]:${port}/redirect-target.png` }
        });
      }
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    });
    return port;
  });
}

async function removeImageEndpoints(app: ElectronApplication) {
  await app.evaluate(async ({ session }) => {
    session.defaultSession.protocol.unhandle('https');
    await new Promise<void>((resolve) => globalThis.__t228Endpoints.server.close(resolve));
  });
}

test('blocks mapped internal images through the native image protocol and keeps public images renderable', async (
  { desktopApp, desktopWindow }, testInfo
) => {
  const port = await installImageEndpoints(desktopApp);
  try {
    const sources = [
      `http://127.0.0.1:${port}/plain.png`,
      `http://[::ffff:127.0.0.1]:${port}/dotted.png`,
      `http://[::ffff:7f00:1]:${port}/hex.png`,
      'https://t228.example.com/redirect.png',
      'https://t228.example.com/public.png'
    ];
    const results = await desktopWindow.evaluate(async (urls) => {
      const results = [];
      for (const source of urls) {
        const url = new URL('foliole-remote-image://render');
        url.searchParams.set('source', source);
        url.searchParams.set('v', '3');
        const image = new Image();
        const loaded = await new Promise<boolean>((resolve) => {
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = url.toString();
        });
        results.push({ source, loaded, width: image.naturalWidth });
      }
      return results;
    }, sources);
    const probe = await desktopApp.evaluate(() => ({
      hits: globalThis.__t228Endpoints.hits,
      publicRequests: globalThis.__t228Endpoints.publicRequests
    }));
    await testInfo.attach('native-mapped-address-evidence', {
      body: JSON.stringify({ results, probe }, null, 2), contentType: 'application/json'
    });
    expect(results.map(({ loaded }) => loaded)).toEqual([false, false, false, false, true]);
    expect(results[4].width).toBe(1);
    expect(probe.hits).toBe(0);
    expect(probe.publicRequests).toEqual(['/redirect.png', '/public.png']);
  } finally {
    await removeImageEndpoints(desktopApp);
  }
});

declare global {
  var __t228Endpoints: { hits: number; publicRequests: string[]; server: Server };
}
