import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T732-5/native');
const nodeId = 'floating-outline-editing';
const initial = '# Outline editing\n\n' + Array.from({ length: 16 }, (_, index) =>
  `## Section ${index + 1}\n\nParagraph for this section.\n`).join('\n');

async function content(page: Page) {
  return page.evaluate(() => window.__folioleDebug!.getEditorContent('prompt-editor')!);
}

async function select(page: Page, from: number, to = from) {
  expect(await page.evaluate(({ from, to }) =>
    window.__folioleDebug!.setEditorSelection('prompt-editor', from, to), { from, to })).toBe(true);
  await expect.poll(() => page.evaluate(() =>
    window.__folioleDebug!.getEditorSelection('prompt-editor'))).toEqual({ from, to });
}

async function openOutline(page: Page) {
  const zone = page.getByLabel('Document outline hover zone');
  const bounds = await zone.boundingBox();
  if (!bounds) throw new Error('outline hover zone missing');
  await page.mouse.move(bounds.x + bounds.width - 20, bounds.y + 160);
  const navigation = page.getByRole('navigation', { name: 'Topic outline', exact: true });
  await expect(navigation).toBeVisible();
  await expect(navigation.locator('..')).toHaveCSS('opacity', '0.8');
  expect((await navigation.boundingBox())!.width).toBeGreaterThan(0);

}

async function expectNavigation(page: Page, title: string) {
  const current = await content(page);
  await expect.poll(() => page.evaluate(id =>
    window.__folioleWorkspaceDebug!.getNode(id)?.content, nodeId)).toBe(current);
  await page.getByRole('navigation', { name: 'Topic outline', exact: true })
    .getByRole('button', { name: title, exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    window.__folioleDebug!.getEditorSelection('prompt-editor')?.from)).toBe(current.indexOf(title));
  await expect.poll(() => page.evaluate(position => {
    const api = window.__folioleDebug!;
    const top = api.getEditorPositionViewportTop('prompt-editor', position);
    const viewport = api.getEditorViewportRect('prompt-editor');
    return top !== null && viewport !== null && top >= viewport.top && top < viewport.top + viewport.height;
  }, current.indexOf(title))).toBe(true);
}

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ nodeId, initial }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: nodeId, kind: 'topic', title: 'Outline editing', content: initial }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode(nodeId);
  }, { nodeId, initial });
  const right = page.locator('[data-workspace-sidebar-toggle="right"]:visible').first();
  if (await right.getAttribute('aria-pressed') === 'true') await right.click();
  await expect.poll(() => content(page)).toBe(initial);
  await page.locator('.prompt-editor-host .cm-content').click();
  await select(page, initial.indexOf('Paragraph for this section.'));
  await openOutline(page);
}

test('keeps the native floating outline usable while editing without leaving its hover region', async ({ desktopWindow: page }) => {
  await prepare(page);
  const navigation = page.getByRole('navigation', { name: 'Topic outline', exact: true });
  await expect(navigation.getByRole('button', { name: 'Section 1', exact: true })).toBeVisible();
  await page.keyboard.type('Inserted paragraph. ');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'body-input.json'), JSON.stringify({ content: await content(page) }, null, 2));
  await expect(navigation.getByRole('button', { name: 'Section 1', exact: true })).toBeVisible();
  await expectNavigation(page, 'Section 2');
  await openOutline(page);

  let current = await content(page);
  const from = current.indexOf('## Section 2\n');
  await select(page, from, from + '## Section 2'.length);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('## Renamed section');
  await expect.poll(() => content(page)).toBe(current.replace('## Section 2\n', '## Renamed section\n'));
  fs.writeFileSync(path.join(output, 'rename-input.json'), JSON.stringify({ content: await content(page) }, null, 2));
  await expect(navigation.getByRole('button', { name: 'Renamed section', exact: true })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Section 2', exact: true })).toHaveCount(0);
  await expectNavigation(page, 'Renamed section');
  fs.mkdirSync(output, { recursive: true });
  await openOutline(page);
  fs.writeFileSync(path.join(output, 'outline-geometry.json'), JSON.stringify(await navigation.evaluate(element => ({
    nav: element.getBoundingClientRect().toJSON(), panel: element.parentElement!.getBoundingClientRect().toJSON(),
    opacity: getComputedStyle(element.parentElement!).opacity, visibility: getComputedStyle(element).visibility
  })), null, 2));
  await page.screenshot({ path: path.join(output, 'open-after-edit.png'), animations: 'disabled' });

  current = await content(page);
  await select(page, 0, current.length);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('Plain body without headings.');
  await expect(page.getByLabel('Document outline hover zone')).toHaveCount(0);
  await select(page, 0, (await content(page)).length);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('# Restored title\n\n## Restored section\n\nBody.');
  await page.mouse.move(10, 10);
  await openOutline(page);
  await expectNavigation(page, 'Restored section');

  await page.mouse.move(10, 10);
  await expect(navigation).not.toBeVisible();
  current = await content(page);
  const restored = current.indexOf('## Restored section');
  await select(page, restored, restored + '## Restored section'.length);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('## Latest section');
  await openOutline(page);
  await expectNavigation(page, 'Latest section');
  await expect(navigation.getByRole('button', { name: 'Restored section', exact: true })).toHaveCount(0);
  await openOutline(page);
  await page.screenshot({ path: path.join(output, 'reopened-current.png'), animations: 'disabled' });
  const finalContent = await content(page);
  await expect.poll(() => page.evaluate(id =>
    window.__folioleWorkspaceDebug!.getNode(id)?.content, nodeId)).toBe(finalContent);
  fs.writeFileSync(path.join(output, 'accepted.json'), JSON.stringify({
    bodyEdit: true, rename: true, currentNavigation: true, emptyAndRestored: true,
    closedEditAndReopen: true, finalContent
  }, null, 2));
});
