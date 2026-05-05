import { mkdir } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const sampleContent = `# Markdown Dialect Sample Topic

## GFM Native

- [x] task done
- [ ] task open

~~Deleted~~ text, https://example.com, \`inline code\`.

| Feature | State |
|---|---|
| table | works |
| link | https://example.com |

## Obsidian-Like

==source highlight==
[[Alpha note]]
[[Folder/Beta note|Beta alias]]
[[image.png]]
![[image.png]]

> [!note]
> Callout body.

#tag/sample`;

async function seedMarkdownDialectSample(desktopWindow: Page) {
  await desktopWindow.evaluate(async (content) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content,
        id: 'playwright-markdown-dialect-sample',
        kind: 'topic',
        title: 'Markdown Dialect Sample Topic'
      }
    ]);
    await api?.openNode?.('playwright-markdown-dialect-sample');
  }, sampleContent);
}

async function collectPreviewState(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const firstHeadingPrefix = document.querySelector('.prompt-editor-host .cm-line-h1 .cm-md-heading-syntax-hidden');
    const table = document.querySelector('.prompt-editor-host .cm-md-table');
    const taskCheckboxes = Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-task-checkbox'));
    return {
      calloutTitles: Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-callout-title')).map((node) => (node.textContent ?? '').trim()),
      hasTableWidget: Boolean(document.querySelector('.prompt-editor-host .cm-md-table-widget table')),
      rawText: (document.querySelector('.prompt-editor-host') as HTMLElement | null)?.innerText ?? '',
      sourceHighlights: Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-source-highlight')).map((node) => (node.textContent ?? '').trim()),
      tableBorderTop: table ? getComputedStyle(table).borderTopWidth : null,
      taskCheckboxCount: taskCheckboxes.length,
      taskCheckedCount: taskCheckboxes.filter((node) => (node as HTMLElement).dataset.mdTaskChecked === 'true').length,
      titlePrefixDisplay: firstHeadingPrefix ? getComputedStyle(firstHeadingPrefix).display : null,
      titleVisibleText: (document.querySelector('.prompt-editor-host .cm-line-h1') as HTMLElement | null)?.innerText ?? '',
      wikiLinkTexts: Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-link-text[data-md-link-node-title]')).map((node) => (node.textContent ?? '').trim())
    };
  });
}

test('renders the markdown dialect sample in desktop preview', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedMarkdownDialectSample(desktopWindow);

  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-table-widget table')).toBeVisible();
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-task-checkbox')).toHaveCount(2);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-source-highlight')).toContainText('source highlight');

  const state = await collectPreviewState(desktopWindow);
  await testInfo.attach('markdown-dialect-preview-state', {
    body: JSON.stringify(state, null, 2),
    contentType: 'application/json'
  });

  await mkdir('.tmp/screenshots', { recursive: true });
  await desktopWindow.screenshot({ fullPage: false, path: '.tmp/screenshots/markdown-dialect-preview.png' });

  expect(state.hasTableWidget).toBe(true);
  expect(state.taskCheckboxCount).toBe(2);
  expect(state.taskCheckedCount).toBe(1);
  expect(state.titlePrefixDisplay).toBe('none');
  expect(state.titleVisibleText.trim()).toBe('Markdown Dialect Sample Topic');
  expect(state.wikiLinkTexts).toEqual(expect.arrayContaining(['Alpha note', 'Beta alias', 'image.png']));
  expect(state.rawText).toContain('![[image.png]]');
});
