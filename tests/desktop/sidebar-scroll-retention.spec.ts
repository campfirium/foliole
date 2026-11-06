import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T732-6/native');
const alpha = 'sidebar-scroll-alpha';
const beta = 'sidebar-scroll-beta';
const shortened = '# Short document\n\n## Short heading\nBody';
const content = Array.from({ length: 60 }, (_, index) => `## Section ${index}\n\n${'Body text. '.repeat(25)}\n`).join('\n');

async function showPanel(page: Page, id: 'outline' | 'backlinks', heading = 'Section 20') {
  const direct = page.locator(`.window-titlebar button[data-panel-id="${id}"]`);
  if (await direct.isVisible()) await direct.click();
  else {
    await page.getByRole('button', { name: 'More right sidebar panels', exact: true }).click();
    await page.getByRole('menuitem', { name: id === 'outline' ? /Outline/ : /Backlinks/ }).click();
  }
  const panel = page.locator(`[data-panel-content-root="${id}"]`);
  await expect(panel).toBeVisible();
  if (id === 'outline') await expect(panel.getByRole('button', { name: heading, exact: true })).toBeAttached();
  return panel;
}

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => {
    localStorage.setItem('foliole-app-language', 'en');
    localStorage.setItem('foliole-content-region-scales', JSON.stringify({ 'right-panel:outline': 105 }));
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ alpha, beta, content }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: alpha, kind: 'topic', title: 'Sidebar scroll alpha', content },
      { id: beta, kind: 'topic', title: 'Sidebar scroll beta', content }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode(alpha);
  }, { alpha, beta, content });
  const toggle = page.locator('[data-workspace-sidebar-toggle="right"]:visible').first();
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
  return showPanel(page, 'outline');
}

async function verifyScaleAndResize(page: Page) {
  const panel = page.locator('[data-panel-content-root="outline"]');
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await page.setViewportSize({ ...size, height: size.height - 120 });
  const surface = panel.locator('..');
  await expect.poll(() => surface.evaluate(element => (element as HTMLElement).style.zoom)).toBe('1.05');
  const before = await panel.evaluate(element => element.scrollTop);
  expect(before).toBeGreaterThan(0);
  await showPanel(page, 'backlinks');
  await showPanel(page, 'outline');
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBeCloseTo(before, 0);
  await page.screenshot({ path: path.join(output, 'scaled-and-resized.png') });
  await page.setViewportSize(size);
}

test('continues the same sidebar reading position after short panels without moving the document', async ({ desktopWindow: page }) => {
  const panel = await prepare(page);
  const body = page.locator('.prompt-editor-host .cm-scroller').first();
  await body.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const bodyBefore = await body.evaluate(element => element.scrollTop);
  await panel.hover();
  await page.mouse.wheel(0, 360);
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBeGreaterThan(200);
  const before = await panel.evaluate(element => element.scrollTop);
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'before-switch.png') });
  const short = await showPanel(page, 'backlinks');
  expect(await short.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  expect(await short.evaluate(element => element.scrollTop)).toBe(0);
  await showPanel(page, 'outline');
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBeCloseTo(before, 0);
  expect(await body.evaluate(element => element.scrollTop)).toBeCloseTo(bodyBefore, 0);
  await page.screenshot({ path: path.join(output, 'restored.png') });

  const toggle = page.locator('[data-workspace-sidebar-toggle="right"]:visible').first();
  await toggle.click();
  await toggle.click();
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBeCloseTo(before, 0);
  await verifyScaleAndResize(page);
  await showPanel(page, 'backlinks');
  await page.evaluate(async id => { await window.__folioleWorkspaceDebug!.openNode(id); }, beta);
  await showPanel(page, 'outline');
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBeLessThan(100);
  await page.evaluate(async id => { await window.__folioleWorkspaceDebug!.openNode(id); }, alpha);
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).not.toBeCloseTo(before, 0);

  await panel.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBeGreaterThan(200);
  await showPanel(page, 'backlinks');
  await page.evaluate(async ({ id, shortened }) => {
    await window.__folioleWorkspaceDebug!.updateNodeContent(id, shortened);
  }, { id: alpha, shortened });
  await showPanel(page, 'outline', 'Short heading');
  expect(await panel.evaluate(element => element.scrollTop)).toBe(0);
  await page.screenshot({ path: path.join(output, 'shortened.png') });
  await panel.getByRole('button', { name: 'Short heading', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleDebug!.getEditorSelection('prompt-editor')?.from)).toBe(shortened.indexOf('Short heading'));
  fs.writeFileSync(path.join(output, 'accepted.json'), JSON.stringify({ before, bodyBefore,
    panelSwitch: true, foldReopen: true, scaleAndResize: true, contextReset: true, shortened: true, headingNavigation: true
  }, null, 2));
});
