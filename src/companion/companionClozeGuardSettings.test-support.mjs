/* global process, console */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

import { answer, content, selectAnswer, withDatabase } from './companionClozeGuard.test-support.mjs';

async function edit(page, title, value) {
  await page.getByRole('button', { name: new RegExp(`^${title}`) }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole(title === 'Long cloze mistake guard' ? 'combobox' : 'spinbutton');
  if (title === 'Long cloze mistake guard') await input.selectOption(value);
  else await input.fill(value);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}

async function openSettings(page) {
  const exit = page.getByRole('button', { name: 'Exit', exact: true });
  if (await exit.isVisible()) await exit.click();
  await page.getByTestId('companion-tab-settings').click();
  await page.getByRole('button', { name: 'Cloze guard', exact: true }).click();
}

async function openTopic(page) {
  await page.getByTestId('companion-tab-browse').click();
  await page.getByText('Long topic', { exact: true }).first().click();
}

async function verifySavedCreation(page, file) {
  const children = () => withDatabase(file, db => db.prepare("SELECT kind,content,reveal,anchor_link FROM nodes WHERE parent_id='guard-source'").all());
  await openTopic(page);
  await selectAnswer(page, 'Long topic', false);
  await page.getByRole('toolbar').getByRole('button', { name: 'Close Highlight', exact: true }).waitFor();
  assert.equal(children().length, 1);
  assert.equal(children()[0].kind, 'topic');
  assert.equal(children()[0].content, 'Long topic');
  assert.equal(JSON.parse(children()[0].anchor_link).kind, 'highlight');
  // A second settings visit changes the next action without rebuilding intermediate state.
  await page.locator('[data-node-id="guard-source"] .cm-line').last().click();
  await openSettings(page);
  await edit(page, 'Long cloze mistake guard', 'off');
  await openTopic(page);
  await selectAnswer(page, answer, false);
  await page.getByRole('toolbar').getByRole('button', { name: 'Delete cloze', exact: true }).waitFor();
  assert.equal(children().length, 2);
  assert.ok(children().some(node => node.kind === 'item' && node.reveal === answer));
  assert.equal(withDatabase(file, db => db.prepare("SELECT content FROM nodes WHERE id='guard-source'").get()).content, content);
}

async function verifyRestoredSettings(page, output) {
  await page.getByRole('button', { name: 'Long cloze mistake guard Convert', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Only check when selected answer is longer than 0', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Then guard when generated card front is longer than 600', exact: true }).count(), 1);
  await page.screenshot({ path: path.join(output, 'settings-375.png') });
  await page.setViewportSize({ width: 320, height: 812 });
  await page.getByRole('button', { name: /^Then guard when/ }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('spinbutton').inputValue(), '600');
  const box = await dialog.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 320);
  await page.screenshot({ path: path.join(output, 'settings-edit-320.png') });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
}

async function main() {
  const root = process.cwd();
  await mkdir(path.join(root, '.tmp/artifacts/T693'), { recursive: true });
  const output = await mkdtemp(path.join(root, '.tmp/artifacts/T693/settings-browser-'));
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
    page.setDefaultTimeout(10000);
    await page.goto(url);
    await page.locator('[data-companion-preview-ready="true"]').waitFor({ state: 'attached' });
    await openSettings(page);
    await edit(page, 'Only check when selected answer is longer than', '0');
    await edit(page, 'Then guard when generated card front is longer than', '600');
    await edit(page, 'Long cloze mistake guard', 'convert');
    await context.close();
    withDatabase(file, db => db.prepare("INSERT INTO nodes(id,kind,title,content,priority,created_at,updated_at) VALUES('guard-source','topic','Long topic',?,5,'2026-11-05T00:00:00Z','2026-11-05T00:00:00Z')").run(content));
    context = await launch();
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => result.errors.push(error.message));
    await page.goto(url);
    await page.locator('[data-companion-preview-ready="true"]').waitFor({ state: 'attached' });
    if (await page.getByRole('button', { name: 'Long cloze mistake guard Convert', exact: true }).count() === 0) await openSettings(page);
    await verifyRestoredSettings(page, output);
    await verifySavedCreation(page, file);
    assert.deepEqual(result.errors, []);
    result.passed = true;
  } catch (error) {
    const page = context.pages().at(-1);
    if (page) {
      await page.screenshot({ path: path.join(output, 'failure.png') });
      result.text = await page.locator('body').innerText();
    }
    throw error;
  } finally {
    await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    await context.close(); await server.close(); console.log(JSON.stringify(result));
  }
}

await main();
