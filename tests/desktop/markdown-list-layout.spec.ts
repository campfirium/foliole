import { mkdir } from 'node:fs/promises';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const sampleContent = `# List Layout

- Level one
  - Level two
    - Level three
      - [ ] Level four task

- [ ] Open task
- [x] Completed task`;

test('renders nested list rhythm in character-relative steps', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (content) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{ content, id: 'playwright-markdown-list-layout', kind: 'topic', title: 'List Layout' }]);
    await api?.openNode?.('playwright-markdown-list-layout');
  }, sampleContent);

  const editor = desktopWindow.locator('.prompt-editor-host');
  const markers = editor.locator('[data-md-list-depth]');
  await expect(markers).toHaveCount(6);
  const layout = await markers.evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    const fontSize = Number.parseFloat(style.fontSize);
    return {
      depth: (node as HTMLElement).dataset.mdListDepth,
      gapEm: Number((Number.parseFloat(style.paddingInlineEnd) / fontSize).toFixed(2)),
      levelStartEm: Number((Number.parseFloat(style.marginInlineStart) / fontSize).toFixed(2)),
      markerColumnEm: Number((Number.parseFloat(style.inlineSize) / fontSize).toFixed(2))
    };
  }));

  expect(layout).toEqual([
    { depth: '0', gapEm: 0.5, levelStartEm: 0, markerColumnEm: 2 },
    { depth: '1', gapEm: 0.5, levelStartEm: 2, markerColumnEm: 2 },
    { depth: '2', gapEm: 0.5, levelStartEm: 4, markerColumnEm: 2 },
    { depth: '3', gapEm: 0.5, levelStartEm: 6, markerColumnEm: 2 },
    { depth: '0', gapEm: 0.5, levelStartEm: 0, markerColumnEm: 2 },
    { depth: '0', gapEm: 0.5, levelStartEm: 0, markerColumnEm: 2 }
  ]);
  await testInfo.attach('markdown-list-layout', { body: JSON.stringify(layout, null, 2), contentType: 'application/json' });
  await mkdir('.tmp/artifacts', { recursive: true });
  await editor.screenshot({ path: '.tmp/artifacts/markdown-list-layout-desktop.png' });
});
