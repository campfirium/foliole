import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { cloudflarePagesAssetHash, deployCloudflarePages, resolveCloudflarePagesProject } from './cloudflarePagesClient.js';

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

function response(result: unknown, status = 200) {
  return new Response(JSON.stringify({ result, success: status < 400 }), {
    headers: { 'Content-Type': 'application/json' }, status
  });
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

it('refuses an existing Pages project until reuse is explicit', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response({ subdomain: 'foliole.pages.dev' })));
  await expect(resolveCloudflarePagesProject({
    accountId: 'account', projectName: 'foliole', token: 'api-token', useExistingProject: false
  })).resolves.toEqual({ status: 'exists' });
  await expect(resolveCloudflarePagesProject({
    accountId: 'account', projectName: 'foliole', token: 'api-token', useExistingProject: true
  })).resolves.toEqual({ project: { subdomain: 'foliole.pages.dev' }, status: 'ready' });
});

it('creates a missing Pages project with the fixed Direct Upload branch', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response(null, 404))
    .mockResolvedValueOnce(response({ subdomain: 'new-site.pages.dev' }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(resolveCloudflarePagesProject({
    accountId: 'account', projectName: 'new-site', token: 'api-token', useExistingProject: false
  })).resolves.toEqual({ project: { subdomain: 'new-site.pages.dev' }, status: 'ready' });
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
    body: JSON.stringify({ name: 'new-site', production_branch: 'main' }), method: 'POST'
  });
});

it('never exposes provider error text that echoes the API token', async () => {
  const token = 'SENTINEL-CLOUDFLARE-TOKEN';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    errors: [{ message: `Rejected ${token}` }], success: false
  }), { status: 403 })));
  const request = () => resolveCloudflarePagesProject({
    accountId: 'account', projectName: 'site', token, useExistingProject: false
  });
  await expect(request()).rejects.toThrow('Cloudflare rejected the Account ID, API Token, or required permissions.');
  await expect(request()).rejects.not.toThrow(token);
});

it('never exposes a token echoed by the deployment upload endpoint', async () => {
  const siteRoot = temporarySite();
  const token = 'SENTINEL-DEPLOYMENT-TOKEN';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    errors: [{ message: `Rejected ${token}` }], success: false
  }), { status: 403 })));
  const request = () => deployCloudflarePages({ accountId: 'account', projectName: 'site', siteRoot, token });
  await expect(request()).rejects.toThrow('Cloudflare rejected the Account ID, API Token, or required permissions.');
  await expect(request()).rejects.not.toThrow(token);
});
