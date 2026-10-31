/* global document, window, NodeFilter, Event, URL, requestAnimationFrame, crypto, process, console */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';
import Database from 'better-sqlite3';
import { createServer } from 'vite';

const title = 'Integrated FSRS Scheduling';
const answer = 'Free Spaced Repetition Scheduler';
const content = `# ${title}\n\nIntegrates FSRS (${answer}), an open review scheduler`;

function readNodes(databaseFile) {
  const db = new Database(databaseFile, { readonly: true });
  try {
    return db.prepare("SELECT id,kind,content,reveal,anchor_link FROM nodes WHERE id='cloze-source' OR parent_id='cloze-source'").all();
  } finally { db.close(); }
}

function seedTopic(databaseFile) {
  const db = new Database(databaseFile);
  try {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO nodes(id,kind,title,content,priority,created_at,updated_at) VALUES('cloze-source','topic',?,?,5,?,?)")
      .run(title, content, now, now);
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'daily_flow_%'").all()) {
      db.prepare(`DELETE FROM "${name}"`).run();
    }
    db.prepare("DELETE FROM companion_meta WHERE key LIKE 'flow_resume:%'").run();
  } finally { db.close(); }
}

async function selectText(frame, text, release = false) {
  const selected = await frame.locator('[data-node-id="cloze-source"]').evaluate((article, phrase) => {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const start = nodes.map(node => node.textContent).join('').indexOf(phrase);
    if (start < 0) throw new Error('The source passage is missing');
    const range = document.createRange();
    let offset = 0;
    for (const node of nodes) {
      const end = offset + node.textContent.length;
      if (start >= offset && start < end) range.setStart(node, start - offset);
      if (start + phrase.length > offset && start + phrase.length <= end) {
        range.setEnd(node, start + phrase.length - offset);
        break;
      }
      offset = end;
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return selection.toString();
  }, text);
  assert.equal(selected, text);
  if (release) await frame.locator('[data-node-id="cloze-source"]').dispatchEvent('pointerup', { pointerType: 'touch' });
}

async function openArticle(frame) {
  await frame.getByRole('button', { name: 'Read', exact: true }).waitFor();
  await frame.locator('[data-node-id="cloze-source"]').getByText(title).first().click();
  await frame.getByRole('button', { name: 'Outline', exact: true }).waitFor();
}

async function holdUntilSelectionRecalculated(page, frame, result) {
  let held = false;
  await page.route('**/__foliole_preview/sqlite', async route => {
    if (held) return route.continue();
    held = true;
    result.heldRequest = route.request().postDataJSON();
    const response = await route.fetch();
    // Count real UUIDs without changing their values; the action's DB read is still pending.
    const baseline = await frame.evaluate(() => window.selectionUuidCount);
    await frame.waitForFunction(count => window.selectionUuidCount > count, baseline);
    await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    result.pendingButtonDisabled = await frame.getByRole('button', { name: 'Cloze', exact: true }).isDisabled();
    await route.fulfill({ response });
  });
}

async function checkCreation(frame, databaseFile, expectedAnswer, expectedCount) {
  await selectText(frame, expectedAnswer, expectedCount > 1);
  await frame.getByRole('toolbar').getByRole('button', { name: 'Cloze', exact: true }).click();
  await frame.getByRole('toolbar').waitFor({ state: 'hidden' });
  assert.equal(await frame.evaluate(() => window.getSelection()?.toString()), '');
  const nodes = readNodes(databaseFile);
  const items = nodes.filter(node => node.kind === 'item');
  assert.equal(items.length, expectedCount);
  const item = items.find(node => node.reveal === expectedAnswer);
  assert.ok(item);
  assert.equal(item.content, content.replace(expectedAnswer, '[...]'));
  assert.equal(nodes.find(node => node.kind === 'topic').content, content);
  const anchor = JSON.parse(item.anchor_link);
  assert.equal(anchor.kind, 'cloze');
  assert.deepEqual(anchor.locator, { from: content.indexOf(expectedAnswer), to: content.indexOf(expectedAnswer) + expectedAnswer.length, originalText: expectedAnswer });
  await frame.locator('.cm-md-cloze').first().waitFor();
  return items;
}

async function checkFlow(page, frame, databaseFile, result) {
  await page.clock.setFixedTime(new Date(Date.now() + 36 * 60 * 60 * 1000));
  await frame.goto(frame.url());
  await frame.getByRole('button', { name: 'Show Answer', exact: true }).waitFor();
  const document = frame.locator('[data-companion-article-document="true"]');
  const activeItemId = await document.getAttribute('data-node-id');
  const activeItem = readNodes(databaseFile).find(node => node.id === activeItemId);
  assert.ok(activeItem?.reveal);
  const question = await document.innerText();
  assert.ok(question.includes('[...]'));
  assert.ok(!question.includes(activeItem.reveal));
  await frame.locator('[data-companion-article-document="true"]').getByText(title).first().click();
  await frame.getByRole('button', { name: 'Show Answer', exact: true }).click();
  for (const name of ['Again', 'Hard', 'Good', 'Easy']) await frame.getByRole('button', { name, exact: true }).waitFor();
  await frame.getByText(activeItem.reveal, { exact: true }).waitFor();
  assert.equal(readNodes(databaseFile).filter(node => node.kind === 'item').length, 2);
  assert.deepEqual(result.errors, []);
  result.closed = true;
  result.flow = true;
}

async function main() {
  const root = process.cwd();
  const output = await mkdtemp(path.join(root, '.tmp/artifacts/T673-18/production-'));
  const databaseFile = path.join(output, 'foliole-companionSQLite.db');
  Object.assign(process.env, { FOLIOLE_COMPANION_PREVIEW_DB: databaseFile, VITE_FOLIOLE_DEV_APP_LANGUAGE: 'en', FOLIOLE_VITE_HMR: '1' });
  const server = await createServer({ configFile: path.join(root, 'vite.companion.config.ts'), root: path.join(root, 'src/companion'),
    server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' });
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/?__foliole_preview_frame=1`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3,
    locale: 'en-US', colorScheme: 'light', reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  const result = { output, databaseFile, errors: [] };
  try {
    const bootstrap = await context.newPage();
    await bootstrap.goto(url);
    await bootstrap.locator('[data-companion-preview-ready="true"]').waitFor({ state: 'attached' });
    await bootstrap.close();
    seedTopic(databaseFile);
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    await page.addInitScript(() => {
      window.selectionUuidCount = 0;
      const original = crypto.randomUUID.bind(crypto);
      crypto.randomUUID = () => { window.selectionUuidCount++; return original(); };
    });
    await page.route('**/__cloze_test_frame', route => route.fulfill({ contentType: 'text/html',
      body: `<iframe title="Cloze production" src="${url}" style="position:absolute;left:0;top:26px;width:360px;height:652px;border:0"></iframe>` }));
    await page.goto(new URL('/__cloze_test_frame', url).href);
    const frame = await (await page.getByTitle('Cloze production').elementHandle()).contentFrame();
    assert.ok(frame);
    await openArticle(frame);
    await holdUntilSelectionRecalculated(page, frame, result);
    await checkCreation(frame, databaseFile, answer, 1);
    result.firstCreationClosed = true;
    assert.equal(result.pendingButtonDisabled, true, 'the pending submission stays disabled through selection recalculation');
    // A later selection remains independently usable in the same editor and persisted library.
    result.items = (await checkCreation(frame, databaseFile, 'open review scheduler', 2)).length;
    await checkFlow(page, frame, databaseFile, result);
  } catch (error) {
    result.failure = error.stack;
    throw error;
  } finally {
    await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    await context.close();
    await browser.close();
    await server.close();
    console.log(JSON.stringify(result));
  }
}

await main();
