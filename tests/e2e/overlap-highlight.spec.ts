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
  await expectHighlightedTextVisible(page, 'to Foliole');
  await expectOverlapStyleVisible(page, 'to Foliole', '.cm-md-highlight-overlap');
  await expectHighlightOverlayStructure(page, 'to Foliole');
  await expectNoVisibleOverlapGap(page);
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

    const firstText = 'Welcome to Foliole';
    const secondText = 'to Foliole';
    const from = content.indexOf(selectionStep === 'first' ? firstText : secondText);
    const to = from + (selectionStep === 'first' ? firstText.length : secondText.length);

    if (from < 0 || to <= from) {
      return false;
    }

    return api.setEditorSelection('prompt-editor', from, to);
  }, step);

  expect(selected).toBe(true);
}

async function expectHighlightedTextVisible(page: Page, text: string) {
  const visible = await page.evaluate((targetText) => {
    return Array.from(
      document.querySelectorAll('.prompt-editor-host .cm-md-highlight, .prompt-editor-host .cm-md-highlight-overlap')
    ).some((node) =>
      (node.textContent ?? '').includes(targetText)
    );
  }, text);
  expect(visible).toBe(true);
}

async function expectOverlapStyleVisible(page: Page, text: string, selector: string) {
  const visible = await page.evaluate(({ targetText, targetSelector }) => {
    return Array.from(document.querySelectorAll(`.prompt-editor-host ${targetSelector}`)).some((node) =>
      (node.textContent ?? '').includes(targetText)
    );
  }, { targetSelector: selector, targetText: text });
  expect(visible).toBe(true);
}

async function expectNoVisibleOverlapGap(page: Page) {
  const hasGap = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-highlight-overlap'));
    const rects = nodes.flatMap((node) =>
      Array.from(node.getClientRects()).map((rect) => ({
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top
      }))
    );
    if (rects.length <= 1) {
      return false;
    }

    const rows: Array<{ left: number; right: number; top: number; bottom: number }[]> = [];
    for (const rect of rects) {
      const row = rows.find((current) => Math.abs(current[0].top - rect.top) < 3);
      if (row) {
        row.push(rect);
      } else {
        rows.push([rect]);
      }
    }

    for (const row of rows) {
      row.sort((a, b) => a.left - b.left);
      for (let index = 0; index < row.length - 1; index += 1) {
        const current = row[index];
        const next = row[index + 1];
        const gap = next.left - current.right;
        if (gap > 0.8) {
          return true;
        }
      }
    }

    return false;
  });

  expect(hasGap).toBe(false);
}

async function expectHighlightOverlayStructure(page: Page, text: string) {
  const nested = await page.evaluate((targetText) => {
    return Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-highlight-overlap')).some((node) => {
      const matchedText = (node.textContent ?? '').includes(targetText);
      const hasHighlightParent = !!node.parentElement?.classList.contains('cm-md-highlight');
      const hasHighlightChild = !!node.querySelector('.cm-md-highlight');
      return matchedText && (hasHighlightParent || hasHighlightChild);
    });
  }, text);

  expect(nested).toBe(true);
}
