import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';

test('keeps native main responsive during local Publish preparation without deploying', async ({ desktopApp }, testInfo) => {
  const artifactRoot = path.resolve('.tmp/artifacts/T511');
  await mkdir(artifactRoot, { recursive: true });
  const siteRoot = await mkdtemp(path.join(artifactRoot, 'native-site-'));
  try {
    for (let index = 0; index < 50; index += 1) {
      await writeFile(path.join(siteRoot, `${index}.bin`), Buffer.alloc(1024 * 1024, index));
    }
    const result = await prepareInNativeMain(desktopApp, siteRoot);
    expect(result.turnsBeforeNetwork).toBeGreaterThan(2);
    expect(result.hashCount).toBe(50);
    expect(Object.keys(result.manifest).sort()).toEqual(Array.from({ length: 50 }, (_, index) => `/${index}.bin`).sort());
    expect(Object.values(result.manifest).every((hash) => /^[a-f0-9]{32}$/u.test(hash))).toBe(true);
    expect(result.endpoints).toHaveLength(3);
    await testInfo.attach('native-publish-preparation', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    await writeFile(path.join(artifactRoot, 'native-preparation.json'), JSON.stringify(result, null, 2));
  } finally { await rm(siteRoot, { recursive: true, force: true }); }
});

test('quits the native host while a preparation worker is active', async ({ desktopApp }) => {
  const artifactRoot = path.resolve('.tmp/artifacts/T511');
  await mkdir(artifactRoot, { recursive: true });
  const siteRoot = await mkdtemp(path.join(artifactRoot, 'shutdown-site-'));
  try {
    for (let index = 0; index < 50; index += 1) {
      await writeFile(path.join(siteRoot, `${index}.bin`), Buffer.alloc(1024 * 1024, index));
    }
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      desktopApp.process().once('exit', (code, signal) => resolve({ code, signal }));
    });
    const wasActive = await desktopApp.evaluate(async ({ app }, input) => {
      const moduleApi = process.getBuiltinModule('module');
      const pathApi = process.getBuiltinModule('path');
      if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
      const require = moduleApi.createRequire(pathApi.join(input.cwd, 'package.json'));
      const client = require(pathApi.join(input.cwd, 'dist/electron/foliolePublish/cloudflarePagesPreparationWorkerClient.js'));
      let settled = false;
      void client.prepareCloudflarePagesFilesOffMainThread(input.siteRoot).then(
        () => { settled = true; }, () => { settled = true; }
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      setImmediate(() => app.quit());
      return !settled;
    }, { cwd: process.cwd(), siteRoot });
    expect(wasActive).toBe(true);
    expect(await exited).toEqual({ code: 0, signal: null });
  } finally { await rm(siteRoot, { recursive: true, force: true }); }
});

async function prepareInNativeMain(desktopApp: ElectronApplication, siteRoot: string) {
  return desktopApp.evaluate(async (_, input) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(input.cwd, 'package.json'));
    const client = require(pathApi.join(input.cwd, 'dist/electron/foliolePublish/cloudflarePagesClient.js'));
    const originalFetch = globalThis.fetch;
    let turns = 0;
    let turnsBeforeNetwork = 0;
    let hashCount = 0;
    let manifest: Record<string, string> = {};
    const endpoints: string[] = [];
    const timer = setInterval(() => { turns += 1; }, 5);
    const started = performance.now();
    globalThis.fetch = async (url, init) => {
      const endpoint = String(url);
      endpoints.push(endpoint);
      let result: unknown;
      if (endpoint.endsWith('/upload-token')) {
        turnsBeforeNetwork = turns;
        result = { jwt: 'synthetic' };
      } else if (endpoint.endsWith('/check-missing')) {
        hashCount = JSON.parse(String(init?.body)).hashes.length;
        result = [];
      } else if (endpoint.endsWith('/deployments')) {
        manifest = JSON.parse(String((init?.body as FormData).get('manifest')));
        result = { id: 'synthetic', latest_stage: { status: 'success' } };
      } else { throw new Error('Unexpected endpoint: real network is disabled.'); }
      return new Response(JSON.stringify({ result, success: true }), { status: 200 });
    };
    try {
      await client.deployCloudflarePages({ accountId: 'synthetic', projectName: 'synthetic', siteRoot: input.siteRoot, token: 'synthetic' });
      return { elapsedMs: performance.now() - started, endpoints, hashCount, manifest, turnsBeforeNetwork };
    } finally {
      clearInterval(timer);
      globalThis.fetch = originalFetch;
    }
  }, { cwd: process.cwd(), siteRoot });
}
