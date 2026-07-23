import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { cloudflarePagesAssetHash, deleteCloudflarePagesProject, deployCloudflarePages, resolveCloudflarePagesProject } from './cloudflarePagesClient.js';

const roots: string[] = [];
function temporarySite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-cloudflare-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>Hello</h1>');
  return root;
}
afterEach(() => {
  vi.useRealTimers();
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
    return response({
      id: 'deployment', latest_stage: { status: 'success' }, url: 'https://deployment.pages.dev'
    });
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
  expect(deployment.get('branch')).toBe('main');
  expect(JSON.parse(String(deployment.get('manifest')))).toEqual({ '/index.html': expect.any(String) });
});

it('accepts an active deployment without polling Cloudflare again', async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/upload-token')) return response({ jwt: 'upload-jwt' });
    if (url.endsWith('/check-missing')) return response([]);
    return response({ id: 'deployment', latest_stage: { status: 'active' } });
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(deployCloudflarePages({
    accountId: 'account', projectName: 'project', siteRoot: temporarySite(), token: 'api-token', waitForCompletion: false
  })).resolves.toMatchObject({ latest_stage: { status: 'active' } });
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/deployments/deployment'))).toBe(false);
});

it('still waits for completion in connection and theme deployment flows', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/upload-token')) return response({ jwt: 'upload-jwt' });
    if (url.endsWith('/check-missing')) return response([]);
    if (url.endsWith('/deployments')) return response({ id: 'deployment', latest_stage: { status: 'active' } });
    return response({ id: 'deployment', latest_stage: { status: 'success' } });
  });
  vi.stubGlobal('fetch', fetchMock);

  const pending = deployCloudflarePages({
    accountId: 'account', projectName: 'project', siteRoot: temporarySite(), token: 'api-token'
  });
  await vi.runAllTimersAsync();

  await expect(pending).resolves.toMatchObject({ latest_stage: { status: 'success' } });
});

it('reports a terminal Cloudflare deployment failure', async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/upload-token')) return response({ jwt: 'upload-jwt' });
    if (url.endsWith('/check-missing')) return response([]);
    return response({ id: 'deployment', latest_stage: { status: 'failure' } });
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(deployCloudflarePages({
    accountId: 'account', projectName: 'project', siteRoot: temporarySite(), token: 'api-token'
  })).rejects.toThrow('Cloudflare Pages deployment failed.');
});

it('reports an existing project without exposing a reuse path', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response({ subdomain: 'foliole.pages.dev' })));
  await expect(resolveCloudflarePagesProject({
    accountId: 'account', projectName: 'foliole', token: 'api-token'
  })).resolves.toEqual({ status: 'exists' });
});

it('creates a missing Pages project with the fixed Direct Upload branch', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response(null, 404))
    .mockResolvedValueOnce(response({ subdomain: 'new-site.pages.dev' }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(resolveCloudflarePagesProject({
    accountId: 'account', projectName: 'new-site', token: 'api-token'
  })).resolves.toEqual({ created: true, project: { subdomain: 'new-site.pages.dev' }, status: 'ready' });
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
    body: JSON.stringify({ name: 'new-site', production_branch: 'main' }), method: 'POST'
  });
});

it('deletes the managed Pages project and accepts an already missing project', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({}))
    .mockResolvedValueOnce(response(null, 404));
  vi.stubGlobal('fetch', fetchMock);
  await expect(deleteCloudflarePagesProject({
    accountId: 'account', projectName: 'site', token: 'api-token'
  })).resolves.toBeUndefined();
  await expect(deleteCloudflarePagesProject({
    accountId: 'account', projectName: 'missing', token: 'api-token'
  })).resolves.toBeUndefined();
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
});

it('never exposes provider error text that echoes the API token', async () => {
  const token = 'SENTINEL-CLOUDFLARE-TOKEN';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    errors: [{ message: `Rejected ${token}` }], success: false
  }), { status: 403 })));
  const request = () => resolveCloudflarePagesProject({
    accountId: 'account', projectName: 'site', token
  });
  await expect(request()).rejects.toThrow('Cloudflare rejected the Account ID, authorization result, or required permissions.');
  await expect(request()).rejects.not.toThrow(token);
});

it('never exposes a token echoed by the deployment upload endpoint', async () => {
  const siteRoot = temporarySite();
  const token = 'SENTINEL-DEPLOYMENT-TOKEN';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    errors: [{ message: `Rejected ${token}` }], success: false
  }), { status: 403 })));
  const request = () => deployCloudflarePages({ accountId: 'account', projectName: 'site', siteRoot, token });
  await expect(request()).rejects.toThrow('Cloudflare rejected the Account ID, authorization result, or required permissions.');
  await expect(request()).rejects.not.toThrow(token);
});
