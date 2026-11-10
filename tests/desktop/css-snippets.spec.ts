import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

test('opens the library snippet directory and applies external CSS files', async ({ desktopWindow }) => {
  const library = await desktopWindow.evaluate(async () => {
    const paths = await window.electronAPI!.invoke('load_library_path_settings');
    return paths.library_home;
  });
  const folder = path.join(library, 'Widgets', 'CSS Snippets');
  const snippet = path.join(folder, 'acceptance.css');
  expect(await readFile(path.join(folder, 'CSS Example.css'), 'utf8')).toContain('.cm-line-h1');
  const settings = await openSettingsCategory(desktopWindow, 'Appearance');

  const snippets = settings.getByRole('region', { name: /^(Custom CSS snippets|自定义 CSS 片段)$/ });
  const refresh = snippets.getByRole('button', { name: /^(Refresh snippets|刷新片段)$/ });
  await expect(refresh).toBeEnabled();
  await refresh.scrollIntoViewIfNeeded();
  await expect(snippets.getByText(/No snippets yet|还没有 CSS 片段/)).toHaveCount(0);
  await expect(snippets.getByRole('switch', { name: 'CSS Example.css' })).toHaveAttribute('aria-checked', 'false');
  const evidence = path.resolve('.tmp/artifacts/desktop-acceptance');
  await mkdir(evidence, { recursive: true });
  await desktopWindow.screenshot({ path: path.join(evidence, 'css-snippets-starter.png') });
  await snippets.getByRole('button', { name: /^(Open snippets folder|打开片段文件夹)$/ }).click();
  await expect.poll(async () => (await stat(folder).catch(() => null))?.isDirectory()).toBe(true);
  await writeFile(snippet, ':root { --foliole-css-acceptance: enabled; }', { flag: 'wx' });

  await refresh.click();
  const toggle = snippets.getByRole('switch', { name: 'acceptance.css' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  const search = snippets.getByRole('textbox', { name: /Search snippets|搜索片段/ });
  await search.fill('missing');
  await expect(snippets.getByText(/No matching snippets|没有匹配的片段/)).toBeVisible();
  await search.fill('accept');
  await toggle.click();
  const renderedStyle = () => desktopWindow.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--foliole-css-acceptance').trim()
  );
  await expect.poll(renderedStyle).toBe('enabled');
  await expect(snippets.getByText(/Could not access CSS snippet files|无法访问 CSS 片段文件/)).toHaveCount(0);

  await toggle.scrollIntoViewIfNeeded();
  await desktopWindow.screenshot({ path: path.join(evidence, 'css-snippets.png') });

  await rm(snippet);
  await refresh.click();
  await expect(toggle).toHaveCount(0);
  await expect.poll(renderedStyle).toBe('');
});
