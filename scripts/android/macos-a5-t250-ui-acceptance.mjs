/* global Event, document */

import fs from 'node:fs';
import path from 'node:path';

import { _android } from 'playwright';

const APP_ID = 'com.foliole.android.t250dense';
const ARTICLE_TITLE = 'T234 Dense Annotation Fixture 20260924';
const TARGET = 'T234 unique passage 0175';

async function revealReadingChrome(page) {
  if (await page.getByRole('button', { name: '更多阅读操作' }).count()) return;
  await page.mouse.click(20, 300);
  await page.getByRole('button', { name: '更多阅读操作' }).waitFor();
}

async function openArticle(page) {
  if (await page.locator('[data-companion-readable-document]').count()) return;
  await page.getByTestId('companion-top-bar-left-action').click();
  await page.getByText(ARTICLE_TITLE).first().click();
  await page.locator('[data-companion-readable-document]').waitFor();
}

async function openHighlightSheet(page) {
  await revealReadingChrome(page);
  await page.getByRole('button', { name: '更多阅读操作' }).click();
  await page.getByRole('button', { name: '高亮' }).click();
  return page.getByRole('dialog', { name: '高亮' });
}

async function selectTarget(page, device, evidenceRoot) {
  const dialog = await openHighlightSheet(page);
  const scroller = dialog.locator('div.min-h-0.overflow-y-auto');
  await dialog.getByText('T234 unique passage 0001').waitFor();
  const first = await dialog.getByText('T234 unique passage 0001').count();
  await device.screenshot({ path: path.join(evidenceRoot, 'highlight-first.png') });
  await scroller.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event('scroll'));
  });
  await dialog.getByText('T234 unique passage 0350').waitFor();
  const last = await dialog.getByText('T234 unique passage 0350').count();
  await device.screenshot({ path: path.join(evidenceRoot, 'highlight-last.png') });
  const box = await scroller.boundingBox();
  if (!box) throw new Error('T250 highlight scroll viewport is unavailable.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
  await page.mouse.wheel(0, -11_000);
  await dialog.getByText(TARGET).waitFor();
  await dialog.getByText(TARGET).click();
  await page.getByText(TARGET, { exact: true }).waitFor();
  return { first: first === 1, last: last === 1 };
}

async function readTargetNote(page, device, evidenceRoot, name) {
  const target = page.getByText(TARGET, { exact: true });
  await target.click();
  if (!(await page.getByTestId('companion-selection-note').count())) await target.click();
  await page.getByTestId('companion-selection-note').click();
  const note = await page.locator('[data-companion-selection-toolbar] textarea').inputValue();
  await device.screenshot({ path: path.join(evidenceRoot, name) });
  return note;
}

export async function runT250UiAcceptance({ articleId, evidenceRoot, serial }) {
  const devices = await _android.devices({ omitDriverInstall: true });
  try {
    const device = devices.find((candidate) => candidate.serial() === serial);
    if (!device) throw new Error('Fixed T250 A5 device is unavailable to Playwright.');
    const page = await (await device.webView({ pkg: APP_ID }, { timeout: 30_000 })).page();
    await openArticle(page);
    const article = await page.locator('[data-companion-readable-document]').getAttribute('data-node-id');
    if (article !== articleId) throw new Error('T250 selected article identity mismatch.');
    const edges = await selectTarget(page, device, evidenceRoot);
    const note = await readTargetNote(page, device, evidenceRoot, 'note-0175.png');
    if (note !== 'T250 note 0175') throw new Error(`T250 target note mismatch: ${note}`);
    await page.mouse.click(20, 300);
    await revealReadingChrome(page);
    await page.getByRole('button', { name: '退出' }).click();
    const afterExit = await page.evaluate(() => ({
      articleMounted: Boolean(document.querySelector('[data-companion-readable-document]')),
      noteMounted: Boolean(document.querySelector('[data-companion-selection-toolbar]')),
      targetVisible: document.body.innerText.includes('T234 unique passage 0175')
    }));
    if (Object.values(afterExit).some(Boolean)) throw new Error('T250 article or note remained mounted after exit.');
    await page.getByText(ARTICLE_TITLE).first().click();
    await page.locator('[data-companion-readable-document]').waitFor();
    if (!(await page.getByText(TARGET, { exact: true }).count())) await selectTarget(page, device, evidenceRoot);
    const noteAfterReturn = await readTargetNote(page, device, evidenceRoot, 'note-0175-return.png');
    if (noteAfterReturn !== note) throw new Error('T250 note changed after leaving and returning.');
    const result = { appId: APP_ID, articleId, edges, note, afterExit, noteAfterReturn, status: 'passed' };
    fs.writeFileSync(path.join(evidenceRoot, 'ui-acceptance.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally { await Promise.all(devices.map((device) => device.close())); }
}
