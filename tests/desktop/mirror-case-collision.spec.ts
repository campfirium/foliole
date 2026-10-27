import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedMirrorCases(desktopApp: ElectronApplication, page: Page) {
  const volume = await desktopApp.evaluate(() => {
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('Missing isolated library home');
    const probe = pathApi.join(libraryHome, 'T216-Case-Probe');
    fsApi.writeFileSync(probe, 'case sensitivity probe');
    const caseInsensitive = fsApi.existsSync(pathApi.join(libraryHome, 't216-case-probe'));
    fsApi.unlinkSync(probe);
    return { caseInsensitive, libraryHome };
  });
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async () => {
    const nodes = [
      ['t216-folder-a', 'Issue', null, 'folder'],
      ['t216-folder-b', 'issue', null, 'folder'],
      ['t216-nested-a', 'Nested', 't216-folder-a', 'folder'],
      ['t216-nested-b', 'nested', 't216-folder-b', 'folder'],
      ['t216-first', '面包机sd-P1000', 't216-nested-a', 'topic'],
      ['t216-second', '面包机SD-P1000', 't216-nested-a', 'topic'],
      ['t216-third', '面包机sd-P1000', 't216-nested-b', 'topic']
    ] as const;
    await window.__folioleWorkspaceDebug!.seedNodes(nodes.map(([id, title, parentNodeId, kind]) => ({
      id, title, parentNodeId, kind, content: `Body for ${id}.`
    })), { persist: true });
  });
  return volume;
}

test('exports case-only articles and nested folders without overwriting and keeps repeated paths stable', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const seed = await seedMirrorCases(desktopApp, desktopWindow);
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

async function repairSelectedAlias(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(async (_, cwd) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const storage = require(pathApi.join(cwd, 'dist/electron/mirror/mirrorOutputStorage.js'));
    const sync = require(pathApi.join(cwd, 'dist/electron/mirror/mirrorOutputSync.js'));
    const { loadLibraryPathSettingsSync } = require(pathApi.join(cwd, 'dist/electron/ipc/libraryPaths.js'));
    const before = await connection.runWithDatabaseConnectionOwner(() => {
      const records = storage.loadMirrorArticleRecords() as Map<string, { articleId: string; relativePath: string; mirroredAt: string }>;
      const root = loadLibraryPathSettingsSync().mirror;
      const files = [...records.values()].filter((record) => record.articleId.startsWith('t513-')).map((record) => {
        const file = pathApi.join(root, record.relativePath);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      });
      for (const [first, second] of [['t513-first', 't513-second'], ['t513-other-first', 't513-other-second']]) {
        storage.saveMirrorArticleRecord({ ...records.get(second!)!, relativePath: records.get(first!)!.relativePath });
      }
      return { files, root };
    });
    const result = await sync.syncIncrementalMirrorOutput(['t513-second']);
    const after = await connection.runWithDatabaseConnectionOwner(() => {
      const records = storage.loadMirrorArticleRecords() as Map<string, { articleId: string; relativePath: string; mirroredAt: string }>;
      return before.files.map((original) => {
        const file = pathApi.join(before.root, original.relativePath);
        return { ...records.get(original.articleId)!, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      });
    });
    return { before: before.files, after, result };
  }, process.cwd());
}

test('repairs a selected physical alias without rewriting an unrelated conflict group', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-first', title: 'Café', kind: 'topic', content: 'First alias body.' },
      { id: 't513-second', title: 'Cafe\u0301', kind: 'topic', content: 'Second alias body.' },
      { id: 't513-other-first', title: 'Other', kind: 'topic', content: 'Other first body.' },
      { id: 't513-other-second', title: 'other', kind: 'topic', content: 'Other second body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  const evidence = await repairSelectedAlias(desktopApp);
  expect(evidence.result).toMatchObject({ rebuilt_article_count: 2, pending_article_count: 0 });
  for (const before of evidence.before) {
    const after = evidence.after.find((file) => file.articleId === before.articleId)!;
    expect(after.body).toBe(before.body);
    if (before.articleId.startsWith('t513-other-')) {
      expect(after.mtime).toBe(before.mtime);
    } else {
      expect(after.relativePath).toBe(before.relativePath);
    }
  }
  expect(evidence.after.find((file) => file.articleId === 't513-other-second')!.relativePath)
    .toBe(evidence.before.find((file) => file.articleId === 't513-other-first')!.relativePath);
  await testInfo.attach('selected-alias-repair', {
    body: JSON.stringify(evidence, null, 2), contentType: 'application/json'
  });
});
