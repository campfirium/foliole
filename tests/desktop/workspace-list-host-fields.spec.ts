import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('desktop lists browse and reload without host identities, empty remote lifecycle or raw resource references', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'host-fields-first', kind: 'topic', title: 'First desktop topic', content: 'First desktop body' },
      { id: 'host-fields-second', kind: 'topic', title: 'Second desktop topic', content: 'Second desktop body' }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode('host-fields-first');
  });
  await expect(page.locator('.prompt-editor-host')).toContainText('First desktop body');
  const readPayload = () => page.evaluate(async () => {
    const full = await window.electronAPI.invoke('load_workspace_list_snapshot', {});
    const scoped = await window.electronAPI.invoke('load_workspace_list_projection', {
      nodeIds: ['host-fields-second'], structure: false, libraryScope: full!.libraryScope!
    });
    return { full, scoped };
  });
  const before = await readPayload();
  for (const payload of [before.full, before.scoped]) {
    for (const node of Object.values(payload!.nodesById)) {
      expect(Object.keys(node)).not.toContain('importContentFingerprint');
      expect(Object.keys(node)).not.toContain('importSourceFingerprint');
      expect(Object.keys(node)).not.toContain('readwiseRemoteLifecycle');
      expect(Object.keys(node)).not.toContain('resourceReferences');
    }
    expect(payload!.nodesById['host-fields-second']).toMatchObject({ title: 'Second desktop topic', hasContent: true });
  }
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('host-fields-second'));
  await expect(page.locator('.prompt-editor-host')).toContainText('Second desktop body');
  await page.screenshot({ path: '.tmp/artifacts/T584/browse.png' });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('host-fields-first'));
  await expect(page.locator('.prompt-editor-host')).toContainText('First desktop body');
  const after = await readPayload();
  expect(after.full!.nodesById['host-fields-second']).toEqual(before.full!.nodesById['host-fields-second']);
  expect(after.scoped!.nodesById['host-fields-second']).not.toHaveProperty('readwiseRemoteLifecycle');
});
