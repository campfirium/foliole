import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type ReadProbe = { reads: string[]; completed: string[]; release?: () => void };

async function seedColdTopics(page: Page) {
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { id: 'intent-folder', kind: 'folder', title: 'Intent folder', content: '' },
      ...['a', 'b', 'c', 'd', 'e'].map((id) => ({
        id: `intent-${id}`, title: `Intent ${id}`, kind: 'topic' as const,
        parentNodeId: 'intent-folder', content: `Saved intent body ${id}`
      }))
    ], { persist: true });
    await window.__folioleWorkspaceDebug?.openNode?.('intent-folder');
  });
}

async function installReadProbe(app: ElectronApplication, holdFirst = false) {
  await app.evaluate(({ ipcMain }, hold) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const require = moduleApi.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const target = globalThis as typeof globalThis & { intentReadProbe?: ReadProbe };
    const probe: ReadProbe = { reads: [], completed: [] };
    target.intentReadProbe = probe;
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request) => {
      const id = request.command === 'load_node_document' ? request.args?.nodeId : null;
      if (typeof id === 'string' && /^intent-[a-e]$/.test(id)) {
        probe.reads.push(id);
        if (hold && id === 'intent-a') await new Promise<void>((resolve) => { probe.release = resolve; });
        const result = await handleInvokeRequest(request, { sender: event.sender });
        probe.completed.push(id);
        return result;
      }
      return handleInvokeRequest(request, { sender: event.sender });
    });
  }, holdFirst);
}

async function readProbe(app: ElectronApplication) {
  return app.evaluate(() => {
    const probe = (globalThis as typeof globalThis & { intentReadProbe?: ReadProbe }).intentReadProbe;
    return { reads: probe?.reads ?? [], completed: probe?.completed ?? [] };
  });
}

test('sustained topic intent warms its body once and ordinary visibility does not read bodies', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedColdTopics(desktopWindow);
  await installReadProbe(desktopApp);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.getByRole('treeitem', { name: 'Intent folder', exact: true }).click();
  await desktopWindow.mouse.move(0, 0);
  const topic = desktopWindow.getByRole('treeitem', { name: 'Intent b', exact: true });
  await expect(topic).toBeVisible();
  // Observe beyond the 200ms intent threshold without entering a topic.
  await desktopWindow.waitForTimeout(350);
  expect((await readProbe(desktopApp)).reads).toEqual([]);
  await topic.hover();
  await expect.poll(async () => (await readProbe(desktopApp)).completed).toEqual(['intent-b']);
  const started = Date.now();
  await topic.click();
  await expect(desktopWindow.locator('.cm-content')).toContainText('Saved intent body b');
  expect((await readProbe(desktopApp)).reads).toEqual(['intent-b']);
  await testInfo.attach('prefetch-benefit', {
    body: JSON.stringify({ runtimeReadsBeforeOpen: 1, additionalReadsOnOpen: 0, clickToBodyMs: Date.now() - started }),
    contentType: 'application/json'
  });
  await desktopWindow.screenshot({ path: testInfo.outputPath('prefetched-body.png') });
});

test('ordinary opening bypasses a blocked prefetch and only the newest two queued intents continue', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedColdTopics(desktopWindow);
  await installReadProbe(desktopApp, true);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.getByRole('treeitem', { name: 'Intent folder', exact: true }).click();
  await desktopWindow.getByRole('treeitem', { name: 'Intent a', exact: true }).hover();
  await expect.poll(async () => (await readProbe(desktopApp)).reads).toEqual(['intent-a']);
  for (const id of ['c', 'd', 'e']) {
    await desktopWindow.getByRole('treeitem', { name: `Intent ${id}`, exact: true }).hover();
    await desktopWindow.evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 350)));
  }
  await desktopWindow.getByRole('treeitem', { name: 'Intent b', exact: true }).click();
  await expect(desktopWindow.locator('.cm-content')).toContainText('Saved intent body b');
  expect(await readProbe(desktopApp)).toEqual({ reads: ['intent-a', 'intent-b'], completed: ['intent-b'] });
  await desktopApp.evaluate(() => {
    (globalThis as typeof globalThis & { intentReadProbe?: ReadProbe }).intentReadProbe?.release?.();
  });
  await expect.poll(async () => (await readProbe(desktopApp)).completed).toEqual(['intent-b', 'intent-a', 'intent-d', 'intent-e']);
  expect((await readProbe(desktopApp)).reads).toEqual(['intent-a', 'intent-b', 'intent-d', 'intent-e']);
  await testInfo.attach('prefetch-read-order', { body: JSON.stringify(await readProbe(desktopApp)), contentType: 'application/json' });
});
