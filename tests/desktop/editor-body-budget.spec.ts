import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const ID = 'native-body-budget-source';
const ORIGINAL = 'Original body.';
const PASTE = '中文😀'.repeat(110_000);

test('keeps the original on cancel and persists the complete oversized paste in bounded topics', async ({ desktopWindow: page }, testInfo) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{ id, content, kind: 'topic', title: 'Body budget source' }], { persist: true });
    await window.__folioleWorkspaceDebug?.openNode?.(id);
  }, { id: ID, content: ORIGINAL });
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(ORIGINAL);
  const paste = async () => {
    await page.evaluate((position) => window.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position), ORIGINAL.length);
    await page.locator('.prompt-editor-host .cm-content').click();
    await page.keyboard.insertText(PASTE);
  };
  await paste();
  const dialog = page.getByRole('dialog', { name: 'Split long text' });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(ORIGINAL);
  const screenshot = path.resolve('.tmp/artifacts/desktop-acceptance/body-overflow-dialog.png');
  await mkdir(path.dirname(screenshot), { recursive: true });
  await dialog.screenshot({ path: screenshot });
  await testInfo.attach('body-overflow-dialog', { path: screenshot, contentType: 'image/png' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect((await loadNodeDocument(page, ID))?.content).toBe(ORIGINAL);
  await paste();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Split and save' }).click();
  await expect(dialog).toBeHidden();
  expect((await loadNodeDocument(page, ID))?.content).toBe('');
  const ids = await page.evaluate((parentId) => window.__folioleWorkspaceDebug?.listNodes()
    .filter((node) => window.__folioleWorkspaceDebug?.getNode(node.id)?.parentNodeId === parentId).map((node) => node.id).sort() ?? [], ID);
  expect(ids.length).toBeGreaterThan(1);
  const bodies: string[] = [];
  for (const id of ids) {
    const body = (await loadNodeDocument(page, id))?.content;
    expect(typeof body).toBe('string');
    expect(Buffer.byteLength(body ?? '', 'utf8')).toBeLessThanOrEqual(1_048_576);
    bodies.push(body ?? '');
  }
  expect(bodies.join('')).toBe(ORIGINAL + PASTE);
  await page.reload();
  await expectWorkspaceShell(page);
  for (let index = 0; index < ids.length; index += 1) {
    expect((await loadNodeDocument(page, ids[index]!))?.content).toBe(bodies[index]);
  }
});
