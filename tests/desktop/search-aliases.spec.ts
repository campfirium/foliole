import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';

const ORIGINAL_ID = 'search-alias-original';
const ALIAS_ID = 'search-alias-equivalent';

test('editor-saved aliases filter and open the actual matching spelling', async ({ desktopSession, desktopWindow }) => {
  await expect(desktopWindow.getByRole('main', { name: /Foliole (workspace|工作区)/ })).toBeVisible();
  await desktopWindow.evaluate(async ({ originalId, aliasId }) => {
    const api = window.__folioleWorkspaceDebug;
    if (!api) throw new Error('missing workspace debug bridge');
    await api.seedNodes([
      { id: originalId, kind: 'topic', title: 'Original speech', content: 'Obama spoke today.' },
      { id: aliasId, kind: 'topic', title: 'Equivalent speech', content: 'Barack Obama spoke today.' }
    ], { persist: true });
    for (const [nodeId, title, content] of [
      [originalId, 'Original speech', 'Obama spoke today.'],
      [aliasId, 'Equivalent speech', 'Barack Obama spoke today.']
    ]) {
      await window.electronAPI?.invoke('update_node_content', {
        anchorLink: null, content, createdAt: '2026-09-27T00:00:00.000Z', desiredRetention: null,
        hideTitleHeading: false, imageRegions: null, isTitleManual: true, kind: 'topic', nodeId,
        parentNodeId: null, position: null, priority: null, reading: null, reveal: null, review: null,
        title, updatedAt: '2026-09-27T00:00:10.000Z', virtualFilter: null
      });
    }
  }, { originalId: ORIGINAL_ID, aliasId: ALIAS_ID });

  const status = await desktopWindow.evaluate(() =>
    window.electronAPI?.invoke('load_search_alias_file_status', {}));
  if (!status?.path || !path.resolve(status.path).startsWith(path.resolve(desktopSession.target.runtimeStateRoot) + path.sep)) {
    throw new Error('alias file is outside the isolated native test state');
  }
  await fs.mkdir(path.dirname(status.path), { recursive: true });
  await fs.writeFile(status.path, 'Obama | Barack Obama\n', 'utf8');

  await expect.poll(() => desktopWindow.evaluate(async () => {
    const snapshot = await window.electronAPI?.invoke('search_workspace', { query: 'Obama' });
    return snapshot?.results.map((item) => item.id) ?? [];
  })).toEqual(expect.arrayContaining([ORIGINAL_ID, ALIAS_ID]));

  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true'));
  await desktopWindow.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await dialog.getByLabel(/(Search workspace|搜索工作区)/).fill('Obama');
  const filters = dialog.getByRole('group', { name: /(Filter by matching spelling|按命中写法筛选)/ });
  await expect(filters.getByRole('button', { name: 'Barack Obama' })).toBeVisible();
  await filters.getByRole('button', { name: 'Barack Obama' }).click();
  await expect(dialog.getByRole('button', { name: /Equivalent speech/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Original speech/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: /Equivalent speech/ }).click();
  await expect.poll(() => desktopWindow.evaluate(() => {
    const selection = window.__folioleDebug?.getEditorSelection?.('prompt-editor');
    const content = window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? '';
    return selection ? content.slice(selection.from, selection.to) : '';
  })).toBe('Barack Obama');
});
