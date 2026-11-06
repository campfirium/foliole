import fs from 'node:fs';
import path from 'node:path';

import type { EditorView } from '@codemirror/view';
import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T732-5/identity/native');
const initial = '# Outline identity\n\nBody\n\n## Twin\nFirst\n\n## Twin\nSecond\n\n## Target\nLast';
const alpha = 'outline-identity-alpha';
const beta = 'outline-identity-beta';

async function currentContent(page: Page) {
  return page.evaluate(() => window.__folioleDebug!.getEditorContent('prompt-editor')!);
}

async function edit(page: Page, from: number, to: number, insert: string) {
  await page.evaluate(({ from, to, insert }) => {
    const content = document.querySelector('.prompt-editor-host .cm-content') as HTMLElement & {
      cmTile?: { root: { view: EditorView } };
    };
    const view = content.cmTile?.root.view;
    if (!view) throw new Error('current editor view missing');
    view.dispatch({ changes: { from, to, insert }, userEvent: 'input.type' });
  }, { from, to, insert });
}

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ alpha, beta, initial }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: alpha, kind: 'topic', title: 'Outline identity alpha', content: initial },
      { id: beta, kind: 'topic', title: 'Outline identity beta', content: initial }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode(alpha);
  }, { alpha, beta, initial });
  await expect.poll(() => currentContent(page)).toBe(initial);
  const panel = page.locator('[data-panel-content-root="outline"]');
  const toggle = page.locator('[data-workspace-sidebar-toggle="right"]:visible').first();
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
  if (!await panel.isVisible()) {
    const direct = page.locator('.window-titlebar button[data-panel-id="outline"]');
    if (await direct.isVisible()) await direct.click();
    else {
      await page.getByRole('button', { name: 'More right sidebar panels', exact: true }).click();
      await page.getByRole('menuitem', { name: /Outline/ }).click();
    }
  }
  await expect(panel).toBeVisible();
  return page.getByRole('navigation', { name: 'Document outline', exact: true });
}

async function moveBodyAboveHeading(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Document outline', exact: true });
  const heading = await nav.getByRole('button', { name: 'Twin', exact: true }).nth(2).elementHandle();
  const before = await currentContent(page);
  const from = before.indexOf('Second');
  expect(await page.evaluate(from => window.__folioleDebug!.setEditorSelection('prompt-editor', from, from), from)).toBe(true);
  await page.keyboard.press('Alt+ArrowUp');
  const expected = before.replace('## Twin\nSecond', 'Second\n## Twin');
  await expect.poll(() => currentContent(page)).toBe(expected);
  expect(await heading!.evaluate(element => element.isConnected)).toBe(true);
  await nav.getByRole('button', { name: 'Twin', exact: true }).nth(2).click();
  await expect.poll(() => page.evaluate(() => window.__folioleDebug!.getEditorSelection('prompt-editor')?.from))
    .toBe(expected.lastIndexOf('Twin'));
}

test('retains native sidebar focus through editor changes and resets it for another document', async ({ desktopWindow: page }) => {
  const nav = await prepare(page);
  const target = nav.getByRole('button', { name: 'Target', exact: true });
  const original = await target.elementHandle();
  if (!original) throw new Error('target heading missing');
  await target.focus();
  await expect(target).toBeFocused();
  const insertion = (await currentContent(page)).indexOf('Body');
  await edit(page, insertion, insertion, 'Inserted paragraph\n');
  expect(await original.evaluate(element => element.isConnected && document.activeElement === element)).toBe(true);
  await edit(page, insertion, insertion + 'Inserted paragraph\n'.length, '');
  const from = (await currentContent(page)).indexOf('Target');
  await edit(page, from, from + 'Target'.length, 'Renamed target');
  await expect(nav.getByRole('button', { name: 'Renamed target', exact: true })).toBeFocused();
  expect(await original.evaluate(element => element.isConnected)).toBe(true);
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'renamed-focused.png'), animations: 'disabled' });

  const twins = nav.getByRole('button', { name: 'Twin', exact: true });
  const second = await twins.nth(1).elementHandle();
  await twins.nth(1).focus();
  const firstFrom = (await currentContent(page)).indexOf('## Twin');
  await edit(page, firstFrom, firstFrom, '## Twin\nInserted duplicate\n\n');
  await expect(twins).toHaveCount(3);
  expect(await second!.evaluate(element => element.isConnected && document.activeElement === element)).toBe(true);
  const edited = await currentContent(page);
  await expect.poll(() => page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id)?.content, alpha)).toBe(edited);
  expect(await second!.evaluate(element => document.activeElement === element)).toBe(true);
  await twins.nth(2).click();
  await expect.poll(() => page.evaluate(() => window.__folioleDebug!.getEditorSelection('prompt-editor')?.from))
    .toBe(edited.lastIndexOf('Twin'));
  await moveBodyAboveHeading(page);

  await page.evaluate(async id => { await window.__folioleWorkspaceDebug!.openNode(id); }, beta);
  await expect(nav.getByRole('button', { name: 'Target', exact: true })).toBeVisible();
  expect(await original.evaluate(element => element.isConnected)).toBe(false);
  const other = nav.getByRole('button', { name: 'Target', exact: true });
  const beforeReplacement = await other.elementHandle();
  await other.focus();
  const replacement = initial.replace('Last', 'Externally replaced body');
  await page.evaluate(async ({ beta, replacement }) => {
    await window.__folioleWorkspaceDebug!.updateNodeContent(beta, replacement);
  }, { beta, replacement });
  await expect.poll(() => currentContent(page)).toBe(replacement);
  expect(await beforeReplacement!.evaluate(element => element.isConnected)).toBe(false);
  await expect(nav.getByRole('button', { name: 'Target', exact: true })).not.toBeFocused();
  await page.screenshot({ path: path.join(output, 'replacement-context.png'), animations: 'disabled' });
  fs.writeFileSync(path.join(output, 'accepted.json'), JSON.stringify({
    precedingInsertDelete: true, renameFocus: true, duplicateFocusAfterDelivery: true,
    currentNavigation: true, nativeLineMove: true, documentSwitch: true, externalReplacement: true
  }, null, 2));
});
