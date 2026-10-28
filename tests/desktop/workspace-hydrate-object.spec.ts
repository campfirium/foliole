import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('restores a durable topic without encoding a workspace JSON envelope', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'hydrate-topic', kind: 'topic', title: 'Object hydrate topic', content: 'Durable object hydrate body.' },
      { id: 'hydrate-other', kind: 'topic', title: 'Other topic', content: 'Other durable body.' }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode('hydrate-topic');
  });
  await expect(page.locator('.prompt-editor-host')).toContainText('Durable object hydrate body.');
  await page.addInitScript(() => {
    const runtime = window as Window & { __workspaceEnvelopeEncodes: number };
    runtime.__workspaceEnvelopeEncodes = 0;
    const stringify = JSON.stringify;
    JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
      const value = args[0] as { state?: { nodesById?: unknown } } | null;
      if (value?.state?.nodesById) runtime.__workspaceEnvelopeEncodes += 1;
      return stringify(...args);
    }) as typeof JSON.stringify;
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.isHydrated())).toBe(true);
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('hydrate-topic'));
  await expect(page.locator('.prompt-editor-host')).toContainText('Durable object hydrate body.');
  expect(await page.evaluate(() => (window as Window & { __workspaceEnvelopeEncodes: number }).__workspaceEnvelopeEncodes)).toBe(0);
  const document = await page.evaluate(() => window.electronAPI.invoke('load_node_document', { nodeId: 'hydrate-topic' }));
  expect(document?.content).toContain('Durable object hydrate body.');
  await page.screenshot({ path: '.tmp/artifacts/T582/object-hydrate.png' });
});
