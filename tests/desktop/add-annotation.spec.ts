import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const TOPIC_ID = 'playwright-add-annotation';

test('saving an annotation from a text selection persists the excerpt', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (topicId) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{
      content: 'Alpha Beta Gamma',
      id: topicId,
      kind: 'topic',
      title: 'Annotation source'
    }]);
    await window.__folioleWorkspaceDebug?.openNode?.(topicId);
  }, TOPIC_ID);
  await expect.poll(() => desktopWindow.evaluate(() =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', 6, 10) ?? false
  )).toBe(true);

  await desktopWindow.locator('.prompt-editor-host .cm-content').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: rect.left + 120,
      clientY: rect.top + 20
    }));
  });
  const toolbar = desktopWindow.locator('[data-annotation-toolbar="true"]');
  await toolbar.getByRole('button', { name: 'Add Annotation' }).click();
  await desktopWindow.getByPlaceholder(/Add an annotation|添加批注/).fill('Reader thought');
  await desktopWindow.getByRole('button', { name: /^(Save|保存)$/ }).click();

  await expect.poll(() => desktopWindow.evaluate((topicId) =>
    window.__folioleWorkspaceDebug?.listNodes?.()
      .map(({ id }) => window.__folioleWorkspaceDebug?.getNode?.(id))
      .find((node) => node?.parentNodeId === topicId && node?.content === 'Beta\n※ Reader thought')?.id ?? null,
    TOPIC_ID
  )).not.toBeNull();
  const createdId = await desktopWindow.evaluate((topicId) => window.__folioleWorkspaceDebug?.listNodes?.()
    .map(({ id }) => window.__folioleWorkspaceDebug?.getNode?.(id))
    .find((node) => node?.parentNodeId === topicId && node?.content === 'Beta\n※ Reader thought')?.id ?? null,
  TOPIC_ID);
  expect(createdId).toBeTruthy();
  await expect.poll(async () => (await loadNodeDocument(desktopWindow, createdId!))?.content)
    .toBe('Beta\n※ Reader thought');
  await desktopWindow.screenshot({ path: '.tmp/artifacts/desktop-acceptance/add-annotation-saved.png' });
});

test('adding an annotation to an existing highlight persists the updated excerpt', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (topicId) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{
      content: 'Alpha Beta Gamma', id: topicId, kind: 'topic', title: 'Annotation source'
    }]);
    await window.__folioleWorkspaceDebug?.openNode?.(topicId);
  }, TOPIC_ID);
  await expect.poll(() => desktopWindow.evaluate(() =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', 6, 10) ?? false
  )).toBe(true);
  await desktopWindow.locator('.prompt-editor-host .cm-content').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, button: 0, clientX: rect.left + 120, clientY: rect.top + 20
    }));
  });
  await desktopWindow.locator('[data-annotation-toolbar="true"]')
    .getByRole('button', { name: 'Highlight' }).click();
  await expect.poll(() => desktopWindow.evaluate((topicId) =>
    window.__folioleWorkspaceDebug?.listNodes?.()
      .map(({ id }) => window.__folioleWorkspaceDebug?.getNode?.(id))
      .find((node) => node?.parentNodeId === topicId && node?.content === 'Beta')?.id ?? null,
    TOPIC_ID
  )).not.toBeNull();
  await desktopWindow.locator('.cm-md-highlight').first().click();
  await desktopWindow.locator('[data-annotation-toolbar="true"]')
    .getByRole('button', { name: /^(Add Annotation|添加批注)$/ }).click();
  await desktopWindow.getByPlaceholder(/Add an annotation|添加批注/).fill('Added later');
  await desktopWindow.getByRole('button', { name: /^(Save|保存)$/ }).click();

  const createdId = await desktopWindow.evaluate((topicId) => window.__folioleWorkspaceDebug?.listNodes?.()
    .map(({ id }) => window.__folioleWorkspaceDebug?.getNode?.(id))
    .find((node) => node?.parentNodeId === topicId && Boolean(node.anchorLink))?.id ?? null,
  TOPIC_ID);
  expect(createdId).toBeTruthy();
  await expect.poll(async () => (await loadNodeDocument(desktopWindow, createdId!))?.content)
    .toBe('Beta\n※ Added later');
});
