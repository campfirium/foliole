import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';
import { createT178ApiAcceptanceSession } from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/readwise-cutover-continuity');

test('finishes other sources, shows the failed item, and clears its warning after later sync', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-continuity-'));
  const session = await createT178ApiAcceptanceSession(stateRoot);
  try {
    const result = await seedFailedCutover(session.electronApp);
    expect(result.output.status).toBe('completed');
    expect(result.preview.status).toBe('already_completed');
    expect(result.preview.failed_items).toHaveLength(1);
    expect(result.healthy?.latest_node_id).toBeTruthy();
    await session.firstWindow.reload();
    await session.firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
    const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    const issues = settings.getByRole('region', { name: /^(Sync issues|同步问题)$/ });
    await expect(issues).toBeVisible();
    await expect(issues.getByRole('heading', { name: 'Broken' })).toBeVisible();
    await issues.scrollIntoViewIfNeeded();
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const screenshot = path.join(ARTIFACT_DIR, 'completed-with-failure.png');
    await settings.screenshot({ path: screenshot });
    await testInfo.attach('completed-with-failure', { path: screenshot, contentType: 'image/png' });
    const recovered = await recoverFailedCutover(session.electronApp);
    expect(recovered.failed_items).toBeUndefined();
    await expect(issues).toHaveCount(0);
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'recovered.png') });
  } finally {
    await session.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});

async function seedFailedCutover(app: ElectronApplication) {
  return app.evaluate(async () => {
      const moduleApi = process.getBuiltinModule('module')!;
      const pathApi = process.getBuiltinModule('path')!;
      const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const load = (name: string) => require(pathApi.join(process.cwd(), `dist/electron/${name}.js`));
      const connection = load('database/connection');
      await connection.runWithDatabaseConnectionOwner(() => {
        load('database/readwiseHostAssignment').activateReadwiseOnThisHost();
        const identity = load('database/readwiseRemoteIdentity');
        const source = identity.loadReadwiseRemoteSource() ?? identity.createReadwiseRemoteSource();
        const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000199.bin';
        load('import/readwiseApiSecret').writeReadwiseApiSecret(secretRef, 'continuity-fixture');
        identity.saveReadwiseConnectionState({ secretRef, state: 'connected', verifiedAt: 'now' }, source, 'now');
        const driver = connection.openDatabaseConnection().driver;
        load('database/readwiseSourceMode').writeReadwiseSourceMode(driver, 'relay', 'now');
        driver.execute(`CREATE TRIGGER reject_readwise BEFORE INSERT ON nodes
          WHEN NEW.title='Broken' BEGIN SELECT RAISE(ABORT, 'injected source failure'); END`);
      });
      const fetchImpl = async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const results = url.pathname.includes('/v2/')
          ? ['broken', 'healthy'].map((id) => ({ external_id: id, source: 'reader',
            highlights: [{ external_id: `${id}-h`, text: `Body ${id}` }] }))
          : ['broken', 'healthy'].flatMap((id) => [
            { category: 'article', id, title: id === 'broken' ? 'Broken' : 'Healthy', html_content: `<p>Body ${id}</p>` },
            { category: 'highlight', id: `${id}-h`, parent_id: id }
          ]);
        return Response.json({ results, nextPageCursor: null });
      };
      const output = await load('import/readwiseSourceCutover').runReadwiseSourceCutover({
        dependencies: { fetchImpl, minIntervalMs: 0 }
      });
      const preview = await load('import/readwiseSourceCutover').previewReadwiseSourceCutover();
      const healthy = await connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver.queryOne(
        "SELECT latest_node_id FROM import_sources WHERE remote_document_id='healthy'"
      ));
      return { output, preview, healthy };
    });
}

async function recoverFailedCutover(app: ElectronApplication) {
  return app.evaluate(async () => {
      const moduleApi = process.getBuiltinModule('module')!;
      const pathApi = process.getBuiltinModule('path')!;
      const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const load = (name: string) => require(pathApi.join(process.cwd(), `dist/electron/${name}.js`));
      const connection = load('database/connection');
      await connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver.execute('DROP TRIGGER reject_readwise'));
      await load('import/readwiseApiImportRun').runReadwiseApiImport({ trigger: 'manual',
        dependencies: { minIntervalMs: 0, fetchImpl: async () => Response.json({ results: [], nextPageCursor: null }) }
      });
      return load('import/readwiseSourceCutover').previewReadwiseSourceCutover();
    });
}
