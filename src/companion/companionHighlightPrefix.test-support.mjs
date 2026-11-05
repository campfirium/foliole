/* global process, console, document, window, NodeFilter, Event */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

import { withDatabase } from './companionClozeGuard.test-support.mjs';

const title = 'Highlight annotation prefix';
const passage = 'A passage worth annotating';
const content = `# Prefix source\n\n${passage}. More context for reading.`;

async function openSettings(page) {
  await page.locator('[data-companion-preview-ready="true"]').waitFor({ state: 'attached' });
  const lastLine = page.locator('[data-node-id="prefix-source"] .cm-line').last();
  if (await lastLine.count()) await lastLine.click();
  const exit = page.getByRole('button', { name: 'Exit', exact: true }).or(page.getByTestId('companion-reading-exit')).first();
  await page.getByTestId('companion-tab-settings').or(exit).first().waitFor();
  if (await exit.isVisible()) await exit.click();
  await page.getByTestId('companion-tab-settings').click();
  await page.getByRole('button', { name: title, exact: true }).click();
  return page.getByRole('dialog');
}

async function saveSetting(page, value) {
  const dialog = await openSettings(page);
  await dialog.getByRole('textbox', { name: title }).fill(value);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}

async function createAnnotation(page) {
  await page.getByTestId('companion-tab-browse').click();
  await page.getByText('Prefix source', { exact: true }).first().click();
  const article = page.locator('[data-node-id="prefix-source"]');
  await article.evaluate((element, selected) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const start = node.textContent.indexOf(selected);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + selected.length);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error('Passage not found');
  }, passage);
  await article.dispatchEvent('pointerup', { pointerType: 'touch' });
  await page.getByTestId('companion-selection-note').click();
  await page.getByTestId('companion-selection-note-text').fill('Quick annotation');
  await page.getByTestId('companion-selection-note-save').click();
  await page.getByTestId('companion-selection-note-text').waitFor({ state: 'hidden' });
  await page.getByRole('toolbar').getByRole('button', { name: 'Close Highlight', exact: true }).waitFor();
}

async function main() {
  const root = process.cwd();
  await mkdir(path.join(root, '.tmp/artifacts/T695'), { recursive: true });
  const output = await mkdtemp(path.join(root, '.tmp/artifacts/T695/browser-'));
  const file = path.join(output, 'foliole-companionSQLite.db');
  Object.assign(process.env, { FOLIOLE_COMPANION_PREVIEW_DB: file, VITE_FOLIOLE_DEV_APP_LANGUAGE: 'en', FOLIOLE_VITE_HMR: '1' });
  const server = await createServer({ configFile: path.join(root, 'vite.companion.config.ts'), root: path.join(root, 'src/companion'),
    server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' });
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/?__foliole_preview_frame=1`;
  const launch = () => chromium.launchPersistentContext(path.join(output, 'profile'), { headless: true,
    viewport: { width: 375, height: 812 }, locale: 'en-US', colorScheme: 'light', isMobile: true, hasTouch: true });
  let context = await launch();
  const result = { output, errors: [] };
  try {
    let page = await context.newPage();
    await page.goto(url);
    await page.locator('[data-companion-preview-ready="true"]').waitFor({ state: 'attached' });
    await page.close();
    withDatabase(file, db => db.prepare(`INSERT INTO nodes(id,kind,title,content,priority,created_at,updated_at)
      VALUES('prefix-source','topic','Prefix source',?,5,'2026-11-05','2026-11-05')`).run(content));
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(url);
    await saveSetting(page, 'Note: ');
    const dialog = await openSettings(page);
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      await page.screenshot({ path: path.join(output, `prefix-${width}.png`) });
    }
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await context.close();
    context = await launch();
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => result.errors.push(error.message));
    await page.goto(url);
    const restored = await openSettings(page);
    assert.equal(await restored.getByRole('textbox', { name: title }).inputValue(), 'Note: ');
    await restored.getByRole('button', { name: 'Cancel' }).click();
    await createAnnotation(page);
    const children = () => withDatabase(file, db => db.prepare("SELECT id,content FROM nodes WHERE parent_id='prefix-source'").all());
    assert.deepEqual(children().map(node => node.content), [`${passage}\nNote: Quick annotation`]);
    await saveSetting(page, '>> ');
    assert.deepEqual(children().map(node => node.content), [`${passage}\nNote: Quick annotation`]);
    assert.equal(withDatabase(file, db => db.prepare("SELECT content FROM nodes WHERE id='prefix-source'").get()).content, content);
    assert.deepEqual(result.errors, []); result.passed = true;
  } catch (error) {
    const page = context.pages().at(-1);
    if (page) { await page.screenshot({ path: path.join(output, 'failure.png') }); result.text = await page.locator('body').innerText(); }
    throw error;
  } finally {
    await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    await context.close(); await server.close(); console.log(JSON.stringify(result));
  }
}

await main();
