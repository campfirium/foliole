import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { createT178ApiAcceptanceSession } from './harness/t178ApiAcceptanceSession';

const artifacts = path.resolve('.tmp/artifacts/desktop-acceptance/readwise-cutover-membership');

test('preserves matched legacy text and the complete ordered unmatched journal after cutover and reload', async ({ browserName }) => {
  void browserName;
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-cutover-membership-'));
  const session = await createT178ApiAcceptanceSession(stateRoot);
  try {
    const result = await cutover(session.electronApp);
    expect(result.output).toMatchObject({ status: 'completed', migrated_count: 1, unmatched_count: 0 });
    expect(result.journal).toMatchObject({ legacyTotal: 3,
      legacyMatches: [{ nodeId: 'matched', remoteId: 'remote' }],
      unmatchedLegacy: [{ nodeId: 'first', reason: 'unmatched' }, { nodeId: 'last', reason: 'unmatched' }] });
    const expectedNodes = [
      { id: 'first', content: 'Original first' }, { id: 'last', content: 'Original last' },
      { id: 'matched', content: 'Original matched' }
    ];
    expect(result.nodes).toEqual(expectedNodes);
    await session.firstWindow.reload();
    await expectWorkspaceShell(session.firstWindow);
    const reopened = await session.electronApp.evaluate(() => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
      return connection.runWithDatabaseConnectionOwner(() => ({
        journal: require(`${process.cwd()}/dist/electron/database/readwiseSourceCutover.js`).loadReadwiseSourceCutover(),
        nodes: connection.openDatabaseConnection().driver.queryAll(
          "SELECT id,content FROM nodes WHERE id IN ('first','last','matched') ORDER BY id")
      }));
    });
    expect(reopened.journal).toEqual(result.journal);
    expect(reopened.nodes).toEqual(expectedNodes);
    await mkdir(artifacts, { recursive: true });
    await session.firstWindow.screenshot({ path: path.join(artifacts, 'reloaded.png') });
  } finally {
    await session.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

async function cutover(app: ElectronApplication) {
  return app.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const load = (name: string) => require(`${process.cwd()}/dist/electron/${name}.js`);
    const connection = load('database/connection');
    await connection.runWithDatabaseConnectionOwner(() => {
      load('database/readwiseHostAssignment').activateReadwiseOnThisHost();
      const host = load('database/readwiseHostAssignment').loadReadwiseHostAssignment().current_host_name;
      const identity = load('database/readwiseRemoteIdentity');
      const source = identity.createReadwiseRemoteSource();
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000614.bin';
      load('import/readwiseApiSecret').writeReadwiseApiSecret(secretRef, 'membership-fixture');
      identity.saveReadwiseConnectionState({ secretRef, state: 'connected', verifiedAt: 'now' }, source, 'now');
      const driver = connection.openDatabaseConnection().driver;
      load('database/readwiseSourceMode').writeReadwiseSourceMode(driver, 'relay', 'now');
      driver.execute(`INSERT INTO desktop_sources
        (source_ref,source_type,config_ref,host_name,host_platform,root_path,path_flavor,type_settings_json,created_at,updated_at)
        VALUES ('readwise:membership','readwise','membership',?,'darwin','/missing','posix','{"kind":"articles"}','now','now')`, [host]);
      for (const [i, id] of ['first', 'matched', 'last'].entries()) {
        driver.execute(`INSERT INTO nodes (id,kind,title,content,created_at,updated_at)
          VALUES (?,'topic',?,?,'now','now')`, [id, id, `Original ${id}`]);
        driver.execute(`INSERT INTO import_sources
          (source_fingerprint,provider,source_kind,source_name,source_locator,first_imported_at,last_imported_at,
           last_content_fingerprint,latest_node_id,source_ref,source_location,remote_document_id)
          VALUES (?,'desktop_text_file','markdown',?,'missing','now','now','hash',?,'readwise:membership',?,?)`,
        [`source-${i}`, `${id}.md`, id, `${id}.md`, id === 'matched' ? 'remote' : null]);
      }
    });
    const output = await load('import/readwiseSourceCutover').runReadwiseSourceCutover({ dependencies: {
      minIntervalMs: 0, fetchImpl: async (input: string | URL | Request) => Response.json({ nextPageCursor: null,
        results: new URL(String(input)).pathname.includes('/v3/')
          ? [{ category: 'article', id: 'remote', title: 'Remote', html_content: '<p>Remote body</p>' }] : [] })
    } });
    return connection.runWithDatabaseConnectionOwner(() => ({ output,
      journal: load('database/readwiseSourceCutover').loadReadwiseSourceCutover(),
      nodes: connection.openDatabaseConnection().driver.queryAll(
        "SELECT id,content FROM nodes WHERE id IN ('first','last','matched') ORDER BY id")
    }));
  });
}
