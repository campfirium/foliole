import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { connectAndCutoverReadwiseApi, expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t178-30');
const LEGACY_DOCUMENT_ID = 'legacy-document';

async function seedLegacySource(app: ElectronApplication, stateRoot: string) {
  await app.evaluate((_electron, input) => {
    const fs = process.getBuiltinModule('fs');
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!fs || !moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const sourceRoot = pathApi.join(input.stateRoot, 'legacy-readwise');
    const sourcePath = pathApi.join(sourceRoot, 'Sample.md');
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(sourcePath, [
      '# Legacy Sample', '## Full Document', 'Legacy local body.', '## Highlights',
      '- remembered phrase ([View Highlight](https://read.readwise.io/read/highlight-legacy))'
    ].join('\n'));
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const hostName = host.loadReadwiseHostAssignment().current_host_name;
      const timestamp = '2026-09-15T00:00:00.000Z';
      driver.execute(`INSERT INTO nodes
        (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
        VALUES ('topic-legacy',NULL,'topic','Legacy Sample',0,'Legacy local body.',NULL,?,?),
          ('local-cloze','topic-legacy','cloze','Local cloze',1,'Local answer',NULL,?,?)`,
      [timestamp, timestamp, timestamp, timestamp]);
      driver.execute(`INSERT INTO desktop_sources
        (source_ref,source_type,config_ref,host_name,host_platform,root_path,path_flavor,
         type_settings_json,created_at,updated_at) VALUES
        ('readwise:boundary','readwise','boundary',?,?,?,?,?,?,?)`, [
        hostName, process.platform, sourceRoot, process.platform === 'win32' ? 'windows' : 'posix',
        JSON.stringify({ highlightPath: sourceRoot, keepState: 'enabled', kind: 'articles' }),
        timestamp, timestamp
      ]);
      driver.execute(`INSERT INTO import_sources
        (source_fingerprint,provider,source_kind,source_name,source_locator,first_imported_at,
         last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location)
        VALUES ('legacy-source','desktop_text_file','markdown','Sample.md',?,?,?,'hash',
          'topic-legacy','readwise:boundary','Sample.md')`,
      [sourcePath, timestamp, timestamp]);
    });
  }, { stateRoot });
}

async function installFixture(app: ElectronApplication) {
  await app.evaluate(({ clipboard }) => {
    const scope = globalThis as typeof globalThis & {
      __t178Boundary?: { phase: 'initial' | 'incremental'; requests: string[] };
    };
    scope.__t178Boundary = { phase: 'initial', requests: [] };
    scope.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      scope.__t178Boundary!.requests.push(url.toString());
      const phase = scope.__t178Boundary!.phase;
      if (url.pathname === '/api/v2/export/') return Response.json({
        nextPageCursor: null,
        results: [{
          external_id: 'legacy-document', source: 'reader', highlights: phase === 'initial'
            ? [{ external_id: 'highlight-legacy', text: 'remembered phrase' }]
            : [{ external_id: 'highlight-incremental', text: 'incremental phrase' }]
        }]
      });
      const category = url.searchParams.get('category');
      if (category) {
        const results = category === 'highlight'
          ? [{ category: 'highlight', id: phase === 'initial' ? 'highlight-legacy' : 'highlight-incremental',
            parent_id: 'legacy-document', updated_at: '2026-09-16T00:00:00.000Z' }]
          : category === 'article' && phase === 'initial'
            ? [document('legacy-document', false), document('new-category-document', false)] : [];
        return Response.json({ nextPageCursor: null, results });
      }
      const id = url.searchParams.get('id');
      if (id === 'highlight-legacy' || id === 'highlight-incremental') {
        return Response.json({ results: [{ category: 'highlight', id, parent_id: 'legacy-document',
          updated_at: '2026-09-16T00:00:00.000Z' }] });
      }
      return Response.json({ results: id ? [document(id, url.searchParams.has('withHtmlContent'))] : [] });
    };
    function document(id: string, withBody: boolean) {
      return {
        category: 'article', html_content: withBody
          ? `<p>${id === 'legacy-document' ? 'API body with remembered phrase.' : 'New category body.'}</p>`
          : null,
        id, title: id === 'legacy-document' ? 'Legacy Sample' : 'New Category Document',
        updated_at: '2026-09-16T00:00:00.000Z'
      };
    }
    clipboard.writeText('t178-30-token');
  });
}

async function inspect(app: ElectronApplication) {
  return app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const imports = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseApiImportState.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const source = identity.loadReadwiseRemoteSource();
      const imported = source ? [
        imports.loadReadwiseApiImportSource(source.connectionRef, 'legacy-document'),
        imports.loadReadwiseApiImportSource(source.connectionRef, 'new-category-document')
      ] : [null, null];
      return {
        annotationIds: imported[0]?.annotations.map((item: { remoteId: string }) => item.remoteId).sort() ?? [],
        checkpoint: source ? imports.loadReadwiseApiCompletedThrough(source.connectionRef) : null,
        localCloze: driver.queryOne("SELECT content FROM nodes WHERE id='local-cloze'")?.content ?? null,
        nodeIds: imported.map((item) => item?.nodeId ?? null),
        sourceCount: driver.queryOne(
          "SELECT COUNT(*) count FROM import_sources WHERE remote_provider='readwise'"
        ).count
      };
    });
  });
}

async function fixtureState(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as typeof globalThis & {
    __t178Boundary?: { phase: 'initial' | 'incremental'; requests: string[] };
  }).__t178Boundary!);
}

async function runIncremental(app: ElectronApplication) {
  return app.evaluate(async () => {
    (globalThis as typeof globalThis & { __t178Boundary?: { phase: string } }).__t178Boundary!.phase = 'incremental';
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const importer = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiImportRun.js'));
    return connection.runWithDatabaseConnectionOwner(() => importer.runReadwiseApiImport());
  });
}

test('separates exact legacy migration, first discovery, and checkpointed increment', async ({ browserName }, testInfo: TestInfo) => {
  void browserName;
  test.setTimeout(180_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-30-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await seedLegacySource(session.electronApp, stateRoot);
    await installFixture(session.electronApp);
    await expectWorkspaceShell(session.firstWindow);
    const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await connectAndCutoverReadwiseApi(session.firstWindow, settings, 'inbox');
    await expect.poll(() => inspect(session!.electronApp), { timeout: 90_000 }).toMatchObject({
      checkpoint: expect.any(String), localCloze: 'Local answer',
      nodeIds: ['topic-legacy', expect.any(String)], sourceCount: 2
    });

    const initial = await fixtureState(session.electronApp);
    const firstScope = initial.requests.findIndex((value) => new URL(value).searchParams.has('category'));
    expect(firstScope).toBeGreaterThan(0);
    expect(initial.requests.slice(0, firstScope).every((value) => {
      const url = new URL(value);
      return url.pathname === '/api/v3/list/' && url.searchParams.has('id');
    })).toBe(true);
    expect(initial.requests.filter((value) => {
      const url = new URL(value);
      return url.searchParams.get('id') === LEGACY_DOCUMENT_ID
        && url.searchParams.has('withHtmlContent');
    })).toHaveLength(1);

    const incrementalStart = initial.requests.length;
    expect(await runIncremental(session.electronApp)).toMatchObject({ status: 'completed' });
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      annotationIds: ['highlight-incremental', 'highlight-legacy'],
      localCloze: 'Local answer', nodeIds: ['topic-legacy', expect.any(String)], sourceCount: 2
    });
    const finalState = await fixtureState(session.electronApp);
    const incremental = finalState.requests.slice(incrementalStart).map((value) => new URL(value));
    expect(incremental.filter((url) => url.pathname === '/api/v2/export/' || url.searchParams.has('category'))
      .every((url) => url.searchParams.has('updatedAfter'))).toBe(true);
    expect(finalState.requests.filter((value) => {
      const url = new URL(value);
      return url.searchParams.get('id') === LEGACY_DOCUMENT_ID
        && url.searchParams.has('withHtmlContent');
    })).toHaveLength(1);

    await mkdir(ARTIFACT_DIR, { recursive: true });
    const screenshot = path.join(ARTIFACT_DIR, 'migration-sync-boundary.png');
    await settings.screenshot({ path: screenshot });
    await testInfo.attach('migration-sync-boundary', { contentType: 'image/png', path: screenshot });
    await testInfo.attach('request-ledger', {
      body: Buffer.from(JSON.stringify(finalState, null, 2)), contentType: 'application/json'
    });
  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
