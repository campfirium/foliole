/* global document, window, NodeFilter, Event, URL, process, console */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';
import Database from 'better-sqlite3';
import { createServer } from 'vite';

const answer = 'A selected answer long enough to trigger protection';
const secondAnswer = 'A different selected answer for creating a highlight';
const content = `# Long topic\n\n${answer}. ${secondAnswer}. ${'The rest of this topic provides context for reading. '.repeat(15)}`;

function withDatabase(file, run) {
  const db = new Database(file);
  try { return run(db); } finally { db.close(); }
}

async function selectAnswer(page, selected = answer) {
  await page.locator('[data-node-id="guard-source"]').evaluate((article, text) => {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const start = node.textContent.indexOf(text);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error('The selected answer is missing');
  }, selected);
  await page.locator('[data-node-id="guard-source"]').dispatchEvent('pointerup', { pointerType: 'touch' });
  await page.getByRole('toolbar').getByRole('button', { name: 'Cloze', exact: true }).click();
  await page.getByRole('dialog').waitFor();
}

async function verifyJourney(page, frame, file, output, result) {
    const children = () => withDatabase(file, db => db.prepare("SELECT kind,content,reveal,anchor_link FROM nodes WHERE parent_id='guard-source'").all());
    await selectAnswer(frame);
    assert.deepEqual(children(), []);
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      const dialog = frame.getByRole('dialog');
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      for (const label of ['Cloze', 'Highlight', 'Cancel']) {
        const button = await dialog.getByRole('button', { name: label, exact: true }).boundingBox();
        assert.ok(button.height >= 44);
      }
      const screenshot = path.join(output, `guard-${width}.png`);
      await page.screenshot({ path: screenshot });
      result.screenshots.push(screenshot);
    }
    await frame.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await frame.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(children(), []);
    await selectAnswer(frame);
    await frame.getByRole('dialog').getByRole('button', { name: 'Cloze', exact: true }).click();
    await frame.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(children().length, 1);
    assert.equal(children()[0].reveal, answer);
    assert.equal(children()[0].content, content.replace(answer, '[...]').trim());
    assert.equal(JSON.parse(children()[0].anchor_link).kind, 'cloze');
    assert.equal(await frame.evaluate(() => window.getSelection()?.toString()), '');
    await selectAnswer(frame, secondAnswer);
    await frame.getByRole('dialog').getByRole('button', { name: 'Highlight', exact: true }).click();
    await frame.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(children().length, 2);
    assert.ok(children().some(node => node.kind === 'topic' && node.content === secondAnswer && JSON.parse(node.anchor_link).kind === 'highlight'));
    assert.equal(withDatabase(file, db => db.prepare("SELECT content FROM nodes WHERE id='guard-source'").get()).content, content);
    assert.deepEqual(result.errors, []);
    result.passed = true;
}

async function main() {
  const root = process.cwd();
  const artifacts = path.join(root, '.tmp/artifacts/T693');
  await mkdir(artifacts, { recursive: true });
  const output = await mkdtemp(path.join(artifacts, 'browser-'));
  const file = path.join(output, 'foliole-companionSQLite.db');
  Object.assign(process.env, { FOLIOLE_COMPANION_PREVIEW_DB: file, VITE_FOLIOLE_DEV_APP_LANGUAGE: 'en', FOLIOLE_VITE_HMR: '1' });
  const server = await createServer({ configFile: path.join(root, 'vite.companion.config.ts'), root: path.join(root, 'src/companion'),
    server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' });
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/?__foliole_preview_frame=1`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'en-US',
    colorScheme: 'light', isMobile: true, hasTouch: true });
  const result = { output, errors: [], screenshots: [] };
  try {
    const bootstrap = await context.newPage();
    await bootstrap.goto(url);
    await bootstrap.locator('[data-companion-preview-ready="true"]').waitFor({ state: 'attached' });
    await bootstrap.close();
    withDatabase(file, db => {
      db.prepare("INSERT INTO nodes(id,kind,title,content,priority,created_at,updated_at) VALUES('guard-source','topic','Long topic',?,5,'2026-11-05T00:00:00Z','2026-11-05T00:00:00Z')").run(content);
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'daily_flow_%'").all()) db.prepare(`DELETE FROM "${name}"`).run();
      db.prepare("DELETE FROM companion_meta WHERE key LIKE 'flow_resume:%'").run();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => result.errors.push(error.message));
    await page.route('**/__guard_test_frame', route => route.fulfill({ contentType: 'text/html',
      body: `<meta name="viewport" content="width=device-width, initial-scale=1"><iframe title="Guard production" src="${url}" style="position:absolute;left:0;top:0;width:100vw;height:100vh;border:0"></iframe>` }));
    await page.goto(new URL('/__guard_test_frame', url).href);
    const frame = await (await page.getByTitle('Guard production').elementHandle()).contentFrame();
    assert.ok(frame);
    await frame.getByRole('button', { name: 'Read', exact: true }).waitFor();
    await frame.getByText('Long topic', { exact: false }).first().click();
    await frame.getByRole('button', { name: 'Outline', exact: true }).waitFor();
    await verifyJourney(page, frame, file, output, result);
  } catch (error) {
    const active = context.pages().at(-1);
    if (active) {
      await active.screenshot({ path: path.join(output, 'failure.png') });
      result.html = await Promise.all(active.frames().map(frame => frame.locator('body').innerHTML()));
      result.text = await Promise.all(active.frames().map(frame => frame.locator('body').innerText()));
    }
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
