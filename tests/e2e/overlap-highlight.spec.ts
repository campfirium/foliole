import { expect, test, type Page } from '@playwright/test';

test('keeps second highlight active when two highlights overlap', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/');

  await expect(page.locator('.prompt-editor-host .cm-editor')).toBeVisible();

  await selectByStep(page, 'first');
  await createHighlightFromSelection(page);

  await selectByStep(page, 'second');
  await createHighlightFromSelection(page);

  await expect(page.locator('.node-tree-row')).toHaveCount(3);
  await expectHighlightedTextVisible(page, 'to');
});

async function createHighlightFromSelection(page: Page) {
  await page.locator('.document-editor-context-zone').dispatchEvent('contextmenu', {
    button: 2,
    clientX: 120,
    clientY: 24
  });
  const highlightItem = page.getByRole('menuitem', { name: 'Highlight' });
  await expect(highlightItem).toBeEnabled();
  await highlightItem.click();
}

async function selectByStep(page: Page, step: 'first' | 'second') {
  const selected = await page.evaluate((selectionStep) => {
    const api = (window as Window & {
      __folioleDebug?: {
        getEditorContent: (id: string) => string | null;
        setEditorSelection: (id: string, from: number, to: number) => boolean;
      };
    }).__folioleDebug;
    if (!api) {
      return false;
    }

    const content = api.getEditorContent('prompt-editor');
    if (!content) {
      return false;
    }

    const from = content.indexOf('Welcome');
    const to =
      selectionStep === 'first'
        ? from + 'Welcome'.length
        : content.indexOf('to', from) + 'to'.length;

    if (from < 0 || to <= from) {
      return false;
    }

    return api.setEditorSelection('prompt-editor', from, to);
  }, step);

  expect(selected).toBe(true);
}

async function expectHighlightedTextVisible(page: Page, text: string) {
  const visible = await page.evaluate((targetText) => {
    return Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-highlight')).some((node) =>
      (node.textContent ?? '').includes(targetText)
    );
  }, text);
  expect(visible).toBe(true);
}
