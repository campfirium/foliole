import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedMirrorCases(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(async (_, cwd) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('Missing isolated library home');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const { upsertNodeSnapshot } = require(pathApi.join(cwd, 'dist/electron/database/nodeMutations.js'));
    const probe = pathApi.join(libraryHome, 'T216-Case-Probe');
    fsApi.writeFileSync(probe, 'case sensitivity probe');
    const caseInsensitive = fsApi.existsSync(pathApi.join(libraryHome, 't216-case-probe'));
    fsApi.unlinkSync(probe);
    await connection.runWithDatabaseConnectionOwner(() => {
      const nodes = [
        ['t216-folder-a', 'Issue', null, 'folder'],
        ['t216-folder-b', 'issue', null, 'folder'],
        ['t216-nested-a', 'Nested', 't216-folder-a', 'folder'],
        ['t216-nested-b', 'nested', 't216-folder-b', 'folder'],
        ['t216-first', '面包机sd-P1000', 't216-nested-a', 'topic'],
        ['t216-second', '面包机SD-P1000', 't216-nested-a', 'topic'],
        ['t216-third', '面包机sd-P1000', 't216-nested-b', 'topic']
      ];
      nodes.forEach(([id, title, parent, kind], position) => upsertNodeSnapshot({
        nodeId: id, title, parentNodeId: parent, kind, position, content: `Body for ${id}.`,
        isTitleManual: true, hideTitleHeading: false, reveal: null, anchorLink: null,
        createdAt: '2026-03-30T08:00:00.000Z', updatedAt: '2026-03-30T08:00:00.000Z'
      }));
    });
    return { caseInsensitive, libraryHome };
  }, process.cwd());
}

test('exports case-only articles and nested folders without overwriting and keeps repeated paths stable', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const seed = await seedMirrorCases(desktopApp);
  expect(seed.caseInsensitive).toBe(true);

  const outputs: unknown[] = [];
  for (let run = 0; run < 2; run += 1) {
    const result = await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
    expect(result).toMatchObject({ failed_article_count: 0, pending_article_count: 0 });
    const files = await desktopApp.evaluate(async (_, cwd) => {
      const moduleApi = process.getBuiltinModule('module')!;
      const pathApi = process.getBuiltinModule('path')!;
      const fsApi = process.getBuiltinModule('fs')!;
      const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
      const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
      const { loadLibraryPathSettingsSync } = require(pathApi.join(cwd, 'dist/electron/ipc/libraryPaths.js'));
      return connection.runWithDatabaseConnectionOwner(() => {
        const root = loadLibraryPathSettingsSync().mirror;
        const records = connection.openDatabaseConnection().driver.queryAll(
          "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't216-%' ORDER BY article_id"
        ) as Array<{ article_id: string; relative_path: string }>;
        return records.map((record) => ({ ...record,
          body: fsApi.readFileSync(pathApi.join(root, record.relative_path), 'utf8')
        }));
      });
    }, process.cwd());
    expect(files).toHaveLength(3);
    expect(new Set(files.map((file) => file.relative_path.toLowerCase())).size).toBe(3);
    for (const file of files) expect(file.body).toContain(`Body for ${file.article_id}.`);
    outputs.push(files);
  }
  expect(outputs[1]).toEqual(outputs[0]);
  await testInfo.attach('mirror-case-collision-evidence', {
    body: JSON.stringify({ ...seed, outputs }, null, 2), contentType: 'application/json'
  });
});
