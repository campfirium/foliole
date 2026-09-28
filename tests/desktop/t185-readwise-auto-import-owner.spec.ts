import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { createT178ApiAcceptanceSession, seedCompletedReadwiseApiMode } from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t185-auto-import');

async function installReaderTransport(app: ElectronApplication) {
  await app.evaluate(() => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/v2/export/') return Response.json({ nextPageCursor: null, results: [] });
        const selected = url.searchParams.get('id') === 't185-auto';
        const indexed = url.searchParams.get('category') === 'article';
        return Response.json({ nextPageCursor: null, results: selected || indexed ? [{
          category: 'article', html_content: selected ? '<p>Automatic Reader body.</p>' : null,
          id: 't185-auto', title: 'Automatic Reader source', updated_at: '2026-09-28T00:00:00.000Z'
        }] : [] });
      };
  });
}

async function seedReaderConnection(app: ElectronApplication) {
  await seedCompletedReadwiseApiMode(app);
  await app.evaluate(async () => {
      const moduleApi = process.getBuiltinModule('module');
      const pathApi = process.getBuiltinModule('path');
      if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
      const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
      const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
      const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
      await connection.runWithDatabaseConnectionOwner(() => {
        const now = '2026-09-28T00:00:00.000Z';
        const source = identity.ensureReadwiseRemoteSource(false, now);
        const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000185.bin';
        secret.writeReadwiseApiSecret(secretRef, 't185-auto-token');
        identity.saveReadwiseConnectionState({ secretRef, state: 'connected', verifiedAt: now }, source, now);
      });
  });
}

async function settleStartupImport(app: ElectronApplication) {
  await app.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const importRun = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiImportRun.js'));
    if (!importRun.isReadwiseApiImportActive()) return;
    const active = importRun.runReadwiseApiImport();
    importRun.cancelReadwiseApiImport();
    await active.catch(() => undefined);
  });
}

async function runContendedImport(app: ElectronApplication) {
  await app.evaluate(() => {
      const runtime = globalThis as typeof globalThis & { __T185_RELEASE__?: () => void; __T185_HOLD__?: Promise<void> };
      const moduleApi = process.getBuiltinModule('module');
      const pathApi = process.getBuiltinModule('path');
      if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
      const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
      runtime.__T185_HOLD__ = connection.runWithDatabaseConnectionOwner(() => new Promise<void>((resolve) => {
        runtime.__T185_RELEASE__ = resolve;
      }));
  });
  await app.evaluate(() => {
      const runtime = globalThis as typeof globalThis & { __T185_RUN__?: Promise<unknown>; __T185_SETTLED__?: boolean };
      const moduleApi = process.getBuiltinModule('module');
      const pathApi = process.getBuiltinModule('path');
      if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
      const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const importRun = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiImportRun.js'));
      const defaults = require(pathApi.join(process.cwd(), 'dist/lib/core/import/importManagerSettings.js'))
        .createDefaultImportManagerSettings();
      const settings = {
        ...defaults,
        readwiseAutoImportPolicy: { ...defaults.readwiseAutoImportPolicy, articleWithoutHighlights: 'inbox' },
        readwiseSourceMode: 'api'
      };
      runtime.__T185_SETTLED__ = false;
      runtime.__T185_RUN__ = importRun.runReadwiseApiImport({
        dependencies: { minIntervalMs: 0 }, settings, trigger: 'scheduled'
      }).finally(() => { runtime.__T185_SETTLED__ = true; });
  });
  let settledBeforeRelease: boolean | undefined;
  try {
    settledBeforeRelease = await app.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return (globalThis as typeof globalThis & { __T185_SETTLED__?: boolean }).__T185_SETTLED__;
    });
  } finally {
    await app.evaluate(async () => {
      const runtime = globalThis as typeof globalThis & {
        __T185_RELEASE__?: () => void; __T185_HOLD__?: Promise<void>; __T185_RUN__?: Promise<unknown>
      };
      runtime.__T185_RELEASE__?.();
      await runtime.__T185_HOLD__;
    });
  }
  const result = await app.evaluate(() => (globalThis as typeof globalThis & { __T185_RUN__?: Promise<unknown> }).__T185_RUN__);
  return { result, settledBeforeRelease };
}

test('imports a Reader article after another database owner releases the connection', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t185-auto-'));
  const session = await createT178ApiAcceptanceSession(stateRoot);
  try {
    await installReaderTransport(session.electronApp);
    await seedReaderConnection(session.electronApp);
    await settleStartupImport(session.electronApp);
    const { result, settledBeforeRelease } = await runContendedImport(session.electronApp);
    expect({ result, settledBeforeRelease }).toMatchObject({ settledBeforeRelease: false });
    expect(result).toMatchObject({ committed_count: 1, status: 'completed' });
    await session.firstWindow.reload();
    await expectWorkspaceShell(session.firstWindow);
    const article = session.firstWindow.getByRole('treeitem', { name: /Automatic Reader source/ });
    await expect(article).toBeVisible();
    await article.click();
    await expect(session.firstWindow.getByLabel(/^(Document area|文档区域)$/))
      .toContainText('Automatic Reader body.');
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const screenshot = path.join(ARTIFACT_DIR, 'imported-darwin.png');
    await session.firstWindow.screenshot({ path: screenshot });
    await testInfo.attach('t185-auto-import', { contentType: 'image/png', path: screenshot });
  } finally {
    await session.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
