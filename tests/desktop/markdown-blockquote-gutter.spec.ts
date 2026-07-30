import { mkdir } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const sampleContent = `# Continuous Blockquote List

> - Author: Sample
> - Link: example.test

> - First quoted point
> - Second quoted point
> - Third quoted point`;

async function seedBlockquoteSample(desktopWindow: Page) {
  await desktopWindow.evaluate(async (content) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{
      content,
      id: 'playwright-blockquote-gutter-sample',
      kind: 'topic',
      title: 'Continuous Blockquote List'
    }]);
    await api?.openNode?.('playwright-blockquote-gutter-sample');
  }, sampleContent);
}

test('shows the quote gutter on every quoted list item', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedBlockquoteSample(desktopWindow);

  const quotedLines = desktopWindow.locator('.prompt-editor-host .cm-line-quote');
  await expect(quotedLines).toHaveCount(5);
  await expect.poll(() => quotedLines.evaluateAll((lines) => lines.every((line) => {
    const style = getComputedStyle(line);
    return style.borderLeftStyle === 'solid' && Number.parseFloat(style.borderLeftWidth) > 0;
  }))).toBe(true);

  await mkdir('.tmp/artifacts/desktop-acceptance', { recursive: true });
  await desktopWindow.screenshot({
    fullPage: false,
    path: '.tmp/artifacts/desktop-acceptance/markdown-blockquote-gutter.png'
  });
});
