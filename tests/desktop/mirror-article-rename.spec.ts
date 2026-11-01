import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function readOutputs(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const connection = require(`${cwd}/dist/electron/database/connection.js`);
    const { loadLibraryPathSettingsSync } = require(`${cwd}/dist/electron/ipc/libraryPaths.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const root = loadLibraryPathSettingsSync().mirror;
      const records = connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't513-rename%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return { names: fsApi.readdirSync(root), files: records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      }) };
    });
  }, process.cwd());
}

async function renameArticle(page: Page, title: string) {
  await page.locator('[role="treeitem"][data-node-id="t513-rename"]').click();
  await page.keyboard.press('F2');
  const input = page.getByRole('textbox', { name: /^Rename / });
  await expect(input).toBeFocused();
  await input.fill(title);
  await input.press('Enter');
}

test('moves automatic mirror output after normal, case-only and conflicting article renames', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-rename', title: 'Before', kind: 'topic', content: 'Renamed article body.' },
      { id: 't513-rename-other', title: 'Unrelated', kind: 'topic', content: 'Other article body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
    await window.__folioleWorkspaceDebug!.openNode!('t513-rename');
  });
  const before = await readOutputs(desktopApp);
  const outputs = [before];
  for (const title of ['After', 'AFTER', 'Unrelated']) {
    await renameArticle(desktopWindow, title);
    await expect.poll(async () => (await readOutputs(desktopApp)).files[0]!.relative_path, { timeout: 90_000 })
      .toMatch(title === 'Unrelated' ? /^Unrelated.*\.md$/ : new RegExp(`^${title}\\.md$`));
    const output = await readOutputs(desktopApp);
    expect(output.files[0]!.body).toContain('Renamed article body.');
    expect(output.files[1]!.body).toContain('Other article body.');
    if (title !== 'Unrelated') {
      expect(output.names).toContain(`${title}.md`);
      expect(output.files[1]).toEqual(before.files[1]);
    }
    expect(output.names).not.toContain('Before.md');
    if (title === 'AFTER') expect(output.names).not.toContain('After.md');
    if (title === 'Unrelated') expect(output.names).not.toContain('AFTER.md');
    expect(new Set(output.files.map((file) => file.relative_path.normalize('NFC').toLowerCase())).size).toBe(2);
    outputs.push(output);
  }
  await testInfo.attach('article-rename-output', { body: JSON.stringify(outputs, null, 2), contentType: 'application/json' });
});

test('retains an unopened article body through rename, subsequent opening and renderer reload', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([
      { id: 't513-rename', title: 'Before', kind: 'topic', content: '# Before\n\nComplete original body 中😀.' },
      { id: 't513-rename-other', title: 'Control', kind: 'topic', content: 'Untouched control.' }
    ], { persist: true });
    await debug.openNode!('t513-rename-other');
  });
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.getNode('t513-rename')?.content)).toBe('');
  const result = await desktopWindow.evaluate(async () => {
    const debug = window.__folioleWorkspaceDebug!;
    const before = await window.electronAPI!.invoke('load_node_document', { nodeId: 't513-rename' });
    const renamed = await debug.updateNodeTitle('t513-rename', 'After');
    const after = await window.electronAPI!.invoke('load_node_document', { nodeId: 't513-rename' });
    await debug.openNode!('t513-rename');
    return { before, after, renamed };
  });
  expect(result.renamed).toBe(true);
  expect(result.before).toMatchObject({ content: '# Before\n\nComplete original body 中😀.' });
  expect(result.after).toMatchObject({ content: '# After\n\nComplete original body 中😀.' });
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.getNode('t513-rename')?.content))
    .toBe('# After\n\nComplete original body 中😀.');
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect.poll(() => desktopWindow.evaluate(async () =>
    window.electronAPI!.invoke('load_node_document', { nodeId: 't513-rename' }))).toMatchObject(result.after as object);
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find(file => file.article_id === 't513-rename')?.body,
    { timeout: 90_000 }).toContain('Complete original body 中😀.');
  await desktopWindow.screenshot({ path: testInfo.outputPath('unopened-rename.png') });
  await testInfo.attach('unopened-rename-documents', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});
