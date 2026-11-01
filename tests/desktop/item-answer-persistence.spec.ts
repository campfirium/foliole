import { createHash } from 'node:crypto';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument, loadWorkspaceSnapshot } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

for (const withImage of [false, true]) {
  for (const waitForQuestion of [false, true]) {
    test(`persists manually edited Item fields after SQLite load and navigation (images=${withImage}, settled=${waitForQuestion})`, async ({ desktopApp, desktopWindow: page }) => {
      const id = 'answer-persistence-item';
      await expectWorkspaceShell(page);
      const bytesBase64 = withImage ? await desktopApp.evaluate(({ nativeImage }) => nativeImage
        .createFromPath(`${process.cwd()}/assets/brand/foliole-leaf-tight.png`)
        .resize({ width: 1024, height: 1024 }).toPNG().toString('base64')) : null;
      const prefix = bytesBase64 ? `![Leaf](asset://${createHash('sha256').update(Buffer.from(bytesBase64, 'base64')).digest('hex')}.png)\n\n` : '';
      await page.evaluate(async ({ id, prefix, bytesBase64 }) => {
        await window.__folioleWorkspaceDebug!.seedNodes([
          { id, kind: 'item', title: 'Answer persistence', content: `${prefix}Original question`, reveal: `${prefix}Original answer`, parentNodeId: 'special-inbox' }
        ], { persist: true });
        if (bytesBase64) await window.__folioleWorkspaceDebug!.importClipboardImageAttachment({ bytesBase64, mimeType: 'image/png', nodeId: id });
      }, { id, prefix, bytesBase64 });
      await page.reload();
      await expectWorkspaceShell(page);
      await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), id);
      const question = page.locator('.prompt-editor-host .cm-content');
      const answer = page.locator('.answer-editor-host .cm-content');
      await expect(question).toContainText('Original question');
      await expect(answer).toContainText('Original answer');
      await question.locator('.cm-line').last().click();
      await expect(question).toBeFocused();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
      await page.keyboard.insertText(' question edit');
      if (waitForQuestion) await expect.poll(async () => (await loadNodeDocument(page, id))?.content).toBe(`${prefix}Original question question edit`);
      await answer.locator('.cm-line').last().click();
      await expect(answer).toBeFocused();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
      await page.keyboard.insertText(' answer edit');
      await expect(answer).toContainText('Original answer answer edit');
      await page.getByRole('treeitem', { name: /^(Inbox|收件箱)$/ }).click();
      await expect.poll(() => loadNodeDocument(page, id)).toMatchObject({
        content: `${prefix}Original question question edit`, reveal: `${prefix}Original answer answer edit`
      });
      await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), id);
      await expect(question).toContainText('Original question question edit');
      await expect(answer).toContainText('Original answer answer edit');
      await page.reload();
      await expectWorkspaceShell(page);
      expect(await loadNodeDocument(page, id)).toMatchObject({
        content: `${prefix}Original question question edit`, reveal: `${prefix}Original answer answer edit`
      });
    });
  }
}

test('a pending answer does not restore an Item deleted before its buffered save', async ({ desktopWindow: page }) => {
  const id = 'deleted-answer-item';
  await expectWorkspaceShell(page);
  await page.evaluate(async id => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id, kind: 'item', title: 'Deleted Item', content: 'Question', reveal: 'Original answer', parentNodeId: 'special-inbox' }
    ], { persist: true });
  }, id);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), id);
  const answer = page.locator('.answer-editor-host .cm-content');
  await expect(answer).toContainText('Original answer');
  await answer.locator('.cm-line').last().click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
  await page.keyboard.insertText(' pending edit');
  await expect(answer).toContainText('Original answer pending edit');
  expect(await page.evaluate(id => window.__folioleWorkspaceDebug!.deleteNode(id), id)).toBe(true);
  await expect(answer).toHaveCount(0);
  await page.reload();
  await expectWorkspaceShell(page);
  expect((await loadWorkspaceSnapshot(page))?.trashedNodeIds).toContain(id);
});
