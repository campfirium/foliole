import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

test('typed capture reaches the workspace during database contention and remains readable after reload', async ({ desktopSession }) => {
  const page = desktopSession.firstWindow;
  await expectWorkspaceShell(page);
  for (const busy of [true, false]) {
    const text = busy ? 'Captured while background work is active' : 'Captured after background work finishes';
    const result = await desktopSession.electronApp.evaluate(async (_, input) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
      const capture = require(`${process.cwd()}/dist/electron/ipc/importTextCapture.js`);
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const owner = input.busy ? connection.runWithDatabaseConnectionOwner(() => held) : Promise.resolve();
      let completed = false;
      try {
        const pending = Promise.resolve(capture.runTextCaptureToInbox(input.text)).then((value) => {
          completed = true;
          return value;
        });
        await new Promise<void>((resolve) => setImmediate(resolve));
        const waited = !completed;
        release();
        await owner;
        const imported = await pending;
        return { nodeId: imported.node_id as string, waited };
      } finally {
        release();
        await owner;
      }
    }, { busy, text });
    if (busy) expect(result.waited).toBe(true);
    await expect.poll(() => page.evaluate((nodeId) =>
      window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.title ?? null, result.nodeId
    )).toBe(text);
    await expect.poll(async () => (await loadNodeDocument(page, result.nodeId))?.content).toContain(text);
    await page.reload();
    await expectWorkspaceShell(page);
    await expect.poll(async () => (await loadNodeDocument(page, result.nodeId))?.content).toContain(text);
  }
});
