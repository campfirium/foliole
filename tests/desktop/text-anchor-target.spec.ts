import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

for (const overlap of [false, true]) {
  test(`keeps text anchor toolbar targeting unambiguous, overlap=${overlap}`, async ({ desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.evaluate(async (overlap) => {
      const api = window.__folioleWorkspaceDebug!;
      await api.seedNodes([
        { id: 'anchor-source', kind: 'topic', title: 'Anchor source', content: 'Alpha Beta Gamma' },
        { id: 'anchor-cloze', kind: 'item', title: 'Cloze', parentNodeId: 'anchor-source',
          content: '[...] Beta Gamma', reveal: 'Alpha',
          anchorLink: { id: 'cloze', kind: 'cloze', locator: { from: 0, to: 5, originalText: 'Alpha' } } },
        { id: 'anchor-highlight', kind: 'topic', title: 'Highlight', parentNodeId: 'anchor-source',
          content: overlap ? 'Alpha' : 'Beta', anchorLink: { id: 'highlight', kind: 'highlight',
            locator: overlap ? { from: 0, to: 5, originalText: 'Alpha' } : { from: 6, to: 10, originalText: 'Beta' } } }
      ], { persist: true });
      await api.openNode('anchor-source');
    }, overlap);
    const mark = desktopWindow.locator('.prompt-editor-host')
      .locator(overlap ? '.cm-md-anchor-overlap' : '.cm-md-cloze').first();
    await expect(mark).toContainText('Alpha');
    await mark.click();
    const toolbar = desktopWindow.locator('[data-annotation-toolbar="true"]');
    if (overlap) {
      await expect(toolbar).toHaveCount(0);
    } else {
      await expect(toolbar).toBeVisible();
      await toolbar.getByRole('button', { name: /^(Open|打开)$/ }).click();
      await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId()))
        .toBe('anchor-cloze');
    }
    await desktopWindow.screenshot({ path: `.tmp/artifacts/T567/native-target-overlap-${overlap}.png` });
  });
}
