import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('parent and highlight child stay responsive with 3500 topics', async ({ desktopWindow }, testInfo) => {
  test.setTimeout(90_000);
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    const nodes = Array.from({ length: 3498 }, (_, index) => ({
      content: '', id: `scale-topic-${index}`, kind: 'topic' as const, title: `Scale topic ${index}`
    }));
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { content: 'Alpha Beta Gamma', id: 'scale-parent', kind: 'topic', title: 'Scale Parent' },
      {
        anchorLink: { id: 'scale-highlight', kind: 'highlight', locator: { from: 6, originalText: 'Beta', to: 10 } },
        content: 'Beta', id: 'scale-child', kind: 'topic', parentNodeId: 'scale-parent', title: 'Scale Child'
      },
      ...nodes
    ], { persist: false });
    await window.__folioleWorkspaceDebug?.openNode?.('scale-child');
  });
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    const started = Date.now();
    await desktopWindow.getByRole('navigation', { name: /^(Node breadcrumbs|面包屑)$/ })
      .getByRole('button', { name: 'Scale Parent' }).click();
    await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
      .toBe('scale-parent');
    await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toHaveText('Alpha Beta Gamma');
    samples.push({ direction: 'parent', elapsedMs: Date.now() - started,
      flow: await desktopWindow.evaluate(() => window.__foliolePerformanceDebug?.getSnapshot?.().flow) });
    const childStarted = Date.now();
    await desktopWindow.locator('[role="treeitem"][data-node-id="scale-child"]').click();
    await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
      .toBe('scale-child');
    await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toHaveText('Beta');
    samples.push({ direction: 'child', elapsedMs: Date.now() - childStarted,
      flow: await desktopWindow.evaluate(() => window.__foliolePerformanceDebug?.getSnapshot?.().flow) });
  }
  console.log('highlight-navigation-scale', JSON.stringify(samples));
  await testInfo.attach('highlight-navigation-scale', {
    body: JSON.stringify(samples, null, 2), contentType: 'application/json'
  });
  expect(samples.every((sample) => sample.flow?.nodeId === `scale-${sample.direction}`
    && sample.elapsedMs < 500 && (sample.flow.overallReadyDurationMs ?? Infinity) < 150))
    .toBe(true);
  await desktopWindow.screenshot({ path: testInfo.outputPath('scale-parent-child.png') });
});
