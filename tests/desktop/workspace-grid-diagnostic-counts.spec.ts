import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const firstId = 'grid-diagnostic-first';
const secondId = 'grid-diagnostic-second';

test('Grid keeps topics visible with diagnostics off and retains enabled node metadata', async ({ desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ firstId, secondId }) => {
    globalThis.folioleEditorInputDiagnostics?.stop();
    globalThis.folioleEditorInputDiagnostics?.clear();
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: firstId, kind: 'topic', title: 'Grid first topic', content: 'First diagnostic body' },
      { id: secondId, kind: 'topic', title: 'Grid second topic', content: 'Second diagnostic body' }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode(firstId);
  }, { firstId, secondId });
  await expect(page.locator('.prompt-editor-host')).toContainText('First diagnostic body');
  expect(await page.evaluate(() => globalThis.folioleEditorInputDiagnostics?.records.length)).toBe(0);
  await page.screenshot({ path: '.tmp/artifacts/T580/diagnostics-off.png' });

  await page.evaluate(async (id) => {
    globalThis.folioleEditorInputDiagnostics?.start();
    await window.__folioleWorkspaceDebug!.openNode(id);
  }, secondId);
  await expect(page.locator('.prompt-editor-host')).toContainText('Second diagnostic body');
  await expect.poll(() => page.evaluate(() =>
    globalThis.folioleEditorInputDiagnostics?.records.filter((record) =>
      record.event === 'workspace-grid-content-total').length ?? 0)).toBeGreaterThan(0);
  const records = await page.evaluate(() => globalThis.folioleEditorInputDiagnostics?.export());
  const totals = records?.records.filter((record) => record.event === 'workspace-grid-content-total') ?? [];
  expect(totals.at(-1)?.details).toMatchObject({ documentNodeId: secondId, hasExternalOutline: false });
  expect(totals.at(-1)?.details.listNodeCount).toBeGreaterThanOrEqual(2);
  await testInfo.attach('grid-diagnostics', { body: JSON.stringify(records), contentType: 'application/json' });

  await page.evaluate(async (id) => {
    globalThis.folioleEditorInputDiagnostics?.stop();
    globalThis.folioleEditorInputDiagnostics?.clear();
    await window.__folioleWorkspaceDebug!.openNode(id);
  }, firstId);
  await expect(page.locator('.prompt-editor-host')).toContainText('First diagnostic body');
  expect(await page.evaluate(() => globalThis.folioleEditorInputDiagnostics?.records.length)).toBe(0);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), secondId);
  await expect(page.locator('.prompt-editor-host')).toContainText('Second diagnostic body');
});
