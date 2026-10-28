import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('preserves authors, collections and openings in list reads and after reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'metadata-folder', kind: 'folder', title: 'Metadata folder', content: '' },
      { id: 'metadata-header', parentNodeId: 'metadata-folder', kind: 'topic', title: 'Metadata article',
        content: '---\nauthor: [[Ada Lovelace]]\ncollections:\n  - "Guide"\n---\nMetadata readable opening.' },
      { id: 'metadata-plain', parentNodeId: 'metadata-folder', kind: 'topic', title: 'Plain article', content: 'Plain readable opening.' }
    ], { persist: true });
  });
  const checkMetadata = async () => {
    const payload = await page.evaluate(async () => {
      const full = await window.electronAPI.invoke('load_workspace_list_snapshot', {});
      const scoped = await window.electronAPI.invoke('load_workspace_list_projection', {
        nodeIds: ['metadata-header', 'metadata-plain'], structure: false, libraryScope: full!.libraryScope!
      });
      return { full, scoped };
    });
    for (const snapshot of [payload.full, payload.scoped]) {
      expect(snapshot!.nodesById['metadata-header']).toMatchObject({
        authorText: 'Ada Lovelace', collections: ['Guide'], hasContent: true, content: ''
      });
      expect(snapshot!.nodesById['metadata-plain']).toMatchObject({
        authorText: null, collections: [], hasContent: true, content: ''
      });
    }
    await page.getByRole('treeitem', { name: 'Metadata folder', exact: true }).click();
    await expect(page.getByTestId('folder-list-meta-metadata-header')).toContainText('Ada Lovelace');
    await expect(page.getByTestId('folder-list-excerpt-metadata-header')).toContainText('Metadata readable opening.');
    await expect(page.getByTestId('folder-list-excerpt-metadata-plain')).toContainText('Plain readable opening.');
  };
  await page.reload();
  await expectWorkspaceShell(page);
  await checkMetadata();
  await page.screenshot({ path: '.tmp/artifacts/T585/list-metadata.png' });
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('metadata-plain'));
  await expect(page.locator('.prompt-editor-host')).toContainText('Plain readable opening.');
  await page.reload();
  await expectWorkspaceShell(page);
  await expect(page.locator('.prompt-editor-host')).toContainText('Plain readable opening.');
  await checkMetadata();
  await page.screenshot({ path: '.tmp/artifacts/T585/reopened.png' });
});
