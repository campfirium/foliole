import { mkdir } from 'node:fs/promises';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('renders a Mermaid diagram and opens its preview without changing the source', async ({ desktopWindow }) => {
  const content = '# Diagram\n\n```mermaid\ngraph TD; A-->B\n```\n\nEnd';
  const nodeId = 'playwright-mermaid-preview';
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async ({ content, nodeId }) => {
    const api = window.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{ content, id: nodeId, kind: 'topic', title: 'Diagram' }], { persist: true });
    await api?.openNode?.(nodeId);
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', content.length, content.length);
  }, { content, nodeId });

  const diagram = desktopWindow.locator('.cm-md-mermaid-body svg');
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText('A');
  await expect(diagram).toContainText('B');
  await expect(desktopWindow.locator('.cm-md-mermaid-widget-error')).toHaveCount(0);
  await desktopWindow.locator('.cm-md-mermaid-widget').hover();
  await desktopWindow.locator('.cm-md-mermaid-preview-button').click();
  const preview = desktopWindow.locator('.cm-md-mermaid-preview svg');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('A');
  await expect(preview).toContainText('B');
  await expect.poll(() => desktopWindow.evaluate((id) =>
    window.__folioleWorkspaceDebug?.getNode?.(id)?.content, nodeId)).toBe(content);
  await mkdir('.tmp/artifacts/T680', { recursive: true });
  await desktopWindow.screenshot({ path: '.tmp/artifacts/T680/mermaid-preview.png' });
});
