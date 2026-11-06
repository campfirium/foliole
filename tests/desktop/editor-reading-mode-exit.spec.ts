import { mkdirSync } from 'node:fs';

import { facts, openEditingSession } from './editorContentEditing.test-support';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('settles saved tail input on reading mode entry and preserves resumed editing', async ({ desktopWindow: page, desktopSession: session }) => {
  const { editor, base } = await openEditingSession(session, page);
  await editor.click();
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
  await page.keyboard.insertText('Local ');
  await expect.poll(() => facts(session)).toMatchObject({ content: 'Local Base', editing: true });
  await facts(session, true, base.versionId);
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
  await page.keyboard.insertText('Tail ');
  await page.keyboard.press('F11');
  const host = page.locator('.prompt-editor-host');
  await expect(host).toHaveAttribute('data-read-only', 'true');
  await expect.poll(async () => (await facts(session)).parents).toHaveLength(2);
  const settled = await facts(session);
  expect(settled.editing).toBe(false);
  expect(new Set([settled.content, ...settled.alternatives])).toEqual(new Set(['Remote branch', 'Tail Local Base']));
  await expect(editor).toHaveText(settled.content);
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-read-only', 'false');
  await editor.click();
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
  await page.keyboard.insertText('Resumed ');
  await expect.poll(() => facts(session)).toMatchObject({ content: `Resumed ${settled.content}`, editing: true });
  await page.keyboard.press('Escape');
  await expect.poll(() => facts(session)).toMatchObject({ editing: false });
  const final = await facts(session);
  expect(final.content).toBe(`Resumed ${settled.content}`);
  mkdirSync('.tmp/artifacts/T727', { recursive: true });
  await page.screenshot({ path: '.tmp/artifacts/T727/reading-mode-resumed-input.png' });
  await page.reload();
  await expectWorkspaceShell(page);
  expect(await facts(session)).toEqual(final);
});
