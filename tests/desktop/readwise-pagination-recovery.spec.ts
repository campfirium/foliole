import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { createT178ApiAcceptanceSession, seedCompletedReadwiseApiMode } from './harness/t178ApiAcceptanceSession';

async function connect(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const source = identity.ensureReadwiseRemoteSource();
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000370.bin';
      secret.writeReadwiseApiSecret(secretRef, 'fixture-token');
      const now = new Date().toISOString();
      identity.saveReadwiseConnectionState({ secretRef, state: 'connected', verifiedAt: now }, source, now);
    });
  });
}

async function run(app: ElectronApplication, badPage: boolean) {
  return app.evaluate(async (_electron, broken) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (file: string) => require(pathApi.join(process.cwd(), 'dist', file));
    const connection = load('electron/database/connection.js');
    const identity = load('electron/database/readwiseRemoteIdentity.js');
    const api = load('electron/import/readwiseApiImportRun.js');
    const settings = load('lib/core/import/importManagerSettings.js').createDefaultImportManagerSettings();
    settings.readwiseAutoImportPolicy.articleWithoutHighlights = 'inbox';
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      urls.push(url.href);
      if (url.pathname.includes('/v2/export/')) return Response.json({ results: [], nextPageCursor: null });
      if (url.searchParams.get('category') === 'article') {
        if (!url.searchParams.has('pageCursor')) return Response.json({ results: [], nextPageCursor: 17 });
        if (broken) return Response.json({ nextPageCursor: null });
        return Response.json({ nextPageCursor: null, results: [{ id: 'doc', category: 'article', title: 'Recovered article' }] });
      }
      if (url.searchParams.get('id') === 'doc') return Response.json({ nextPageCursor: null, results: [{
        id: 'doc', category: 'article', title: 'Recovered article', html_content: '<p>Recovered body</p>'
      }] });
      return Response.json({ nextPageCursor: null, results: [] });
    };
    let result;
    try { result = await api.runReadwiseApiImport({ settings, dependencies: { fetchImpl, minIntervalMs: 0 } }); }
    catch (error) { result = { error: error instanceof Error ? error.message : String(error) }; }
    return connection.runWithDatabaseConnectionOwner(() => {
      const ref = identity.loadReadwiseRemoteSource().connectionRef;
      const lifecycle = load('electron/import/readwiseApiScheduleState.js').loadReadwiseApiScheduleState(ref).lifecycle;
      const ledgers = load('electron/database/readwiseApiScopeLedger.js').loadReadwiseApiScopeLedgers(ref);
      const source = load('electron/database/readwiseApiImportState.js').loadReadwiseApiImportSource(ref, 'doc');
      const count = connection.openDatabaseConnection().driver.queryOne(
        "SELECT COUNT(*) count FROM import_sources WHERE remote_provider = 'readwise'"
      ).count;
      return { result, lifecycle, ledgers, urls, count, body: source?.body ?? null };
    });
  }, badPage);
}

test('reports malformed pagination failure and resumes to one complete article', async ({ browserName }) => {
  void browserName;
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-pagination-'));
  const session = await createT178ApiAcceptanceSession(stateRoot);
  try {
    await expectWorkspaceShell(session.firstWindow);
    await connect(session.electronApp);
    await seedCompletedReadwiseApiMode(session.electronApp);
    const failed = await run(session.electronApp, true);
    expect(failed.result).toMatchObject({ error: 'readwise_api_page_invalid' });
    expect(failed.lifecycle.status).toBe('failed');
    expect(failed.count).toBe(0);
    expect(failed.ledgers.find((x: { scope: string }) => x.scope === 'reader:article'))
      .toMatchObject({ cursor: '17', checkpoint: null, status: 'running' });
    const recovered = await run(session.electronApp, false);
    expect(recovered.result.status).toBe('completed');
    expect(recovered.lifecycle.status).toBe('completed');
    expect(recovered.count).toBe(1);
    expect(recovered.body).toContain('Recovered body');
    expect(new URL(recovered.urls[0]).searchParams.get('pageCursor')).toBe('17');
    const repeated = await run(session.electronApp, false);
    expect(repeated.result.status).toBe('completed');
    expect(repeated.count).toBe(1);
    expect(repeated.body).toBe(recovered.body);
  } finally {
    await session.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
