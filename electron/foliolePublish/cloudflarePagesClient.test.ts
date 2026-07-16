import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { cloudflarePagesAssetHash, deployCloudflarePages } from './cloudflarePagesClient.js';

const roots: string[] = [];
function temporarySite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-cloudflare-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>Hello</h1>');
  return root;
}
afterEach(() => {
  vi.unstubAllGlobals();
  roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true }));
});

function response(result: unknown) {
  return new Response(JSON.stringify({ result, success: true }), { headers: { 'Content-Type': 'application/json' } });
}

it('matches the Cloudflare SDK BLAKE3 asset-key format', () => {
  expect(cloudflarePagesAssetHash('index.html', Buffer.from('<h1>Hello</h1>')))
    .toBe('8deb79e268ae1932009657bb3e496c87');
});

it('uploads missing assets before creating a manifest deployment', async () => {
  const calls: Array<{ body: BodyInit | null | undefined; url: string }> = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ body: init?.body, url });
    if (url.endsWith('/upload-token')) return response({ jwt: 'upload-jwt' });
    if (url.endsWith('/check-missing')) {
      const hashes = (JSON.parse(String(init?.body)) as { hashes: string[] }).hashes;
      return response(hashes);
    }
    if (url.endsWith('/assets/upload')) return response(null);
    return response({ url: 'https://deployment.pages.dev' });
  });
  vi.stubGlobal('fetch', fetchMock);

  await deployCloudflarePages({ accountId: 'account', projectName: 'project', siteRoot: temporarySite(), token: 'api-token' });

  expect(calls.map((call) => call.url)).toEqual([
    expect.stringContaining('/upload-token'),
    expect.stringContaining('/pages/assets/check-missing'),
    expect.stringContaining('/pages/assets/upload'),
    expect.stringContaining('/deployments')
  ]);
  const deployment = calls.at(-1)?.body as FormData;
  expect(JSON.parse(String(deployment.get('manifest')))).toEqual({ '/index.html': expect.any(String) });
});
