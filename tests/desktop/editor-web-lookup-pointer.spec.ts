import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('opens Google and ChatGPT through real right-click menu presses', async ({
  desktopApp, desktopWindow: page
}, testInfo) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { content: 'Lookup target text', id: 'web-lookup-pointer-topic', kind: 'topic', title: 'Lookup Topic' }
    ]);
    await window.__folioleWorkspaceDebug?.openNode?.('web-lookup-pointer-topic');
  });
  await desktopApp.evaluate(({ shell }) => {
    const openedUrls: string[] = [];
    globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__ = openedUrls;
    shell.openExternal = async (url: string) => { openedUrls.push(url); };
  });
  const editor = page.locator('.prompt-editor-host .cm-content');
  await expect(editor).toContainText('Lookup target text');
  for (const [index, label] of ['Search with Google', 'Chat with ChatGPT'].entries()) {
    await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 18));
    await editor.click({ button: 'right', position: { x: 10, y: 10 } });
    const item = page.getByRole('menuitem', { name: label });
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    if (!box) throw new Error('lookup menu item has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(item).toBeVisible();
    await page.mouse.up();
    await expect(page.getByRole('menu')).toBeHidden();
    await expect.poll(() => desktopApp.evaluate(() =>
      globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__?.length
    )).toBe(index + 1);
  }
  const urls = await desktopApp.evaluate(() => globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__);
  expect(new URL(urls![0]!).hostname).toBe('www.google.com');
  expect(new URL(urls![0]!).searchParams.get('q')).toBe('Lookup target text');
  expect(new URL(urls![1]!).hostname).toBe('chatgpt.com');
  expect(new URL(urls![1]!).searchParams.get('prompt')).toContain('Lookup target text');
  await editor.click({ button: 'right', position: { x: 10, y: 10 } });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menu').screenshot({ path: '.tmp/artifacts/T676/web-lookup-menu.png' });
  await testInfo.attach('web-lookup-menu', {
    body: await page.screenshot(), contentType: 'image/png'
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('menu')).toBeHidden();
});
