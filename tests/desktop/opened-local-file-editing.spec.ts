import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { expect, test } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/windows/playwright-desktop-harness.mjs';

test('opens a Markdown file from launch args as an editable local file and saves to disk', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-opened-local-file-'));
  const filePath = path.join(tempRoot, 'editable.md');
  const largeBody = Array.from({ length: 1800 }, (_, index) => `Reference line ${index + 1} with **markdown** and [link](https://example.com/${index + 1}).`).join('\n');
  await fs.writeFile(filePath, `# Editable\nOriginal body\n${largeBody}`, 'utf8');
  const session = await launchDesktopSession({ appRoot: process.cwd(), extraArgs: [filePath] });

  try {
    const page = session.firstWindow;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect(page.getByRole('treeitem', { name: /^Local$/i })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /editable\.md/i })).toBeVisible();
    await expect(page.getByText(/^(Saved|已保存)$/)).not.toBeVisible();

    const editor = page.locator('.markdown-editor-host .cm-content').first();
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('Original body');
    await page.evaluate(() => globalThis.folioleEditorInputDiagnostics?.start?.());
    await page.keyboard.type('Preface ');
    await expect(page.getByText(/^(Unsaved|未保存)$/)).not.toBeVisible();
    await expect(editor).toContainText('Preface ');
    await page.getByText('Original body', { exact: true }).click();
    await page.keyboard.type(' edited');
    await expect(editor).toContainText('Original body edited');
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nPlaywright saved body');
    await page.keyboard.press('Control+S');

    await expect.poll(() => fs.readFile(filePath, 'utf8')).toContain('Preface ');
    await expect.poll(() => fs.readFile(filePath, 'utf8')).toContain('Original body edited');
    await expect.poll(() => fs.readFile(filePath, 'utf8')).toContain('Playwright saved body');
    const diagnostics = await page.evaluate(() => globalThis.folioleEditorInputDiagnostics?.export?.() ?? null);
    console.log('[opened-local-file-editing-diagnostics]', JSON.stringify(summarizeDiagnostics(diagnostics), null, 2));
    console.log('[opened-local-file-editing-diagnostics-full]', JSON.stringify(diagnostics, null, 2));
    expect(summarizeDiagnostics(diagnostics)['live-markdown-parse'] ?? 0).toBe(0);
    await expect(page.getByText(/^(Saved|已保存)$/)).not.toBeVisible();
  } finally {
    await session.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

function summarizeDiagnostics(exported: unknown) {
  const records = typeof exported === 'object' && exported !== null && Array.isArray((exported as { records?: unknown }).records)
    ? (exported as { records: Array<{ details: Record<string, unknown>; event: string }> }).records
    : [];
  return records.reduce<Record<string, number>>((counts, record) => {
    counts[record.event] = (counts[record.event] ?? 0) + 1;
    return counts;
  }, {});
}
