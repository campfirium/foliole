import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/f3-sequential-read-repair/native');

async function prepare(page: Page, atEnd: boolean) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'read-seq-root', kind: 'folder', title: 'Sequential reading', content: '' },
      { id: 'read-seq-a', kind: 'topic', title: 'Chapter A', parentNodeId: 'read-seq-root',
        content: Array.from({ length: 100 }, (_, i) => `Paragraph ${i + 1}. Continue reading the chapter.`).join('\n\n') },
      { id: 'read-seq-b', kind: 'topic', title: 'Chapter B', content: 'Next chapter.', parentNodeId: 'read-seq-root' }
    ], { persist: true });
  });
  await page.locator('[data-node-id="read-seq-root"]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Enable sequential reading/i }).click();
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  const read = page.getByRole('button', { name: 'Read', exact: true });
  await expect(read).toBeVisible();
  await page.locator('.prompt-editor-host .cm-scroller').evaluate((element, end) => {
    element.scrollTop = end ? element.scrollHeight : 0;
    element.dispatchEvent(new Event('scroll'));
  }, atEnd);
  if (atEnd) await expect(read).toHaveAttribute('data-advance-ready', 'true');
  else await expect(read).not.toHaveAttribute('data-advance-ready', 'true');
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const api = window.__folioleWorkspaceDebug!;
    const disk = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return { session: api.getReviewSession(),
      a: api.getNode('read-seq-a')?.reading, b: api.getNode('read-seq-b')?.reading,
      diskA: disk.nodesById['read-seq-a']?.reading, diskB: disk.nodesById['read-seq-b']?.reading };
  });
}

async function trigger(page: Page, entry: string) {
  if (entry === 'button') return page.getByRole('button', { name: 'Read', exact: true }).click();
  if (entry === 'keyboard') {
    await page.getByRole('button', { name: 'Read', exact: true }).focus();
    return page.keyboard.press('f');
  }
  await page.keyboard.press('Meta+Shift+P');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog.getByRole('textbox', { name: 'Search commands' }).fill('Reading: Read');
  await dialog.getByRole('button', { name: 'Reading: Read', exact: true }).click();
  await expect(dialog).toBeHidden();
}

for (const entry of ['button', 'keyboard', 'palette']) {
  for (const atEnd of [false, true]) {
    test(`Read ${entry} ${atEnd ? 'at end releases next chapter' : 'before end keeps next chapter locked'}`, async ({ desktopWindow: page }) => {
      fs.mkdirSync(output, { recursive: true });
      await prepare(page, atEnd);
      const before = await snapshot(page);
      expect(before.session.currentNodeId).toBe('read-seq-a');
      expect(before.b?.state).toBe('locked');
      expect(before.diskB?.state).toBe('locked');
      await page.screenshot({ path: path.join(output, `${entry}-${atEnd}-before.png`) });
      await trigger(page, entry);
      await expect.poll(async () => (await snapshot(page)).session.readTopicCount).toBe(1);
      const after = await snapshot(page);
      expect(after.a?.repetitionCount).toBe(1);
      expect(after.b?.repetitionCount).toBe(0);
      expect(after.b?.state).toBe(atEnd ? 'active' : 'locked');
      expect(after.session.currentNodeId).toBe(atEnd ? 'read-seq-b' : null);
      expect(after.diskA).toEqual(after.a);
      expect(after.diskB).toEqual(after.b);
      await page.screenshot({ path: path.join(output, `${entry}-${atEnd}-after.png`) });
      await page.reload();
      await expectWorkspaceShell(page);
      await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
      await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getNode('read-seq-a')?.reading)).toEqual(after.diskA);
      await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getNode('read-seq-b')?.reading)).toEqual(after.diskB);
      fs.writeFileSync(path.join(output, `${entry}-${atEnd}.json`), JSON.stringify({ before, after, hydrated: true }, null, 2));
    });
  }
}
