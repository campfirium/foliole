import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Locator } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ARTICLE = [
  '使用Foliole阅读2026年',
  '使用 Foliole 阅读 2026 年',
  '纯中文阅读正文',
  'Plain English reading 2026',
  '使用**Foliole**阅读',
  '`代码Code2026`',
  '```text\n代码Code2026\n```',
  '中文$E=mc^2$公式',
  '| 内容 | Notes |\n| --- | --- |\n| 表格Foliole2026 | Plain English |'
].join('\n\n');

test('adds visual inter-script spacing without changing text or doubling typed spaces', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (content) => {
    const api = window.__folioleWorkspaceDebug!;
    await api.seedNodes([{ content, id: 'reading-autospace', kind: 'topic', title: 'Mixed-script reading' }]);
    await api.openNode('reading-autospace');
  }, ARTICLE);
  const host = desktopWindow.locator('.prompt-editor-host');
  await expect(host).toContainText('使用Foliole阅读2026年');
  await desktopWindow.keyboard.press('F11');
  const lines = host.locator('.cm-line');

  for (const [text, addsSpace] of [
    ['使用Foliole阅读2026年', true], ['使用 Foliole 阅读 2026 年', false],
    ['纯中文阅读正文', false], ['Plain English reading 2026', false]
  ] as const) {
    const line = lines.filter({ hasText: text }).first();
    const difference = await spacingDifference(line);
    if (addsSpace) expect(difference).toBeGreaterThan(1);
    else expect(difference).toBeCloseTo(0, 1);
  }

  const bold = lines.filter({ has: desktopWindow.locator('.cm-md-strong') });
  await expect(bold).toHaveCount(1);
  await writeInlineSpacingDiagnostics(bold);
  expect(await spacingDifference(bold)).toBeGreaterThan(1);
  await expect(host.locator('.cm-md-math-widget-inline')).toHaveCSS('text-autospace', 'no-autospace');
  await expect(host.locator('td').filter({ hasText: '表格Foliole2026' })).toHaveCSS('text-autospace', 'normal');

  for (const code of [host.locator('.cm-md-inline-code'), host.locator('.cm-line-code').filter({ hasText: '代码Code2026' })]) {
    await expect(code.first()).toBeVisible();
    expect(await code.first().evaluate((element) => getComputedStyle(element).getPropertyValue('text-autospace')))
      .toBe('no-autospace');
  }
  expect(await desktopWindow.evaluate(() => window.__folioleDebug.getEditorContent('prompt-editor'))).toBe(ARTICLE);
  const plain = lines.filter({ hasText: '使用Foliole阅读2026年' }).first();
  expect(await plain.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  })).toBe('使用Foliole阅读2026年');
  const directory = path.resolve('.tmp/artifacts/T681');
  await mkdir(directory, { recursive: true });
  await desktopWindow.screenshot({ path: path.join(directory, 'reading-autospace.png') });
  await testInfo.attach('mixed-script-reading', { body: await desktopWindow.screenshot(), contentType: 'image/png' });
});

async function spacingDifference(line: Locator) {
  return line.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const original = range.getBoundingClientRect().width;
    const previous = element.style.getPropertyValue('text-autospace');
    element.style.setProperty('text-autospace', 'no-autospace');
    const withoutSpacing = range.getBoundingClientRect().width;
    if (previous) element.style.setProperty('text-autospace', previous);
    else element.style.removeProperty('text-autospace');
    return original - withoutSpacing;
  });
}

async function writeInlineSpacingDiagnostics(line: Locator) {
  const diagnostic = await line.evaluate((element) => ({
    html: element.outerHTML,
    style: getComputedStyle(element).getPropertyValue('text-autospace'),
    children: [...element.children].map((child) => ({
      html: child.outerHTML, display: getComputedStyle(child).display,
      padding: getComputedStyle(child).padding, margin: getComputedStyle(child).margin,
      weight: getComputedStyle(child).fontWeight, spacing: getComputedStyle(child).getPropertyValue('text-autospace')
    }))
  }));
  await mkdir('.tmp/artifacts/T681', { recursive: true });
  await writeFile('.tmp/artifacts/T681/autospace-inline-diagnostics.json', JSON.stringify(diagnostic, null, 2));
}
