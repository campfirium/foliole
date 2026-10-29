import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('prepares durable attachment demand while the saved article remains usable', async ({ desktopSession, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const key = `${'a'.repeat(64)}.png`;
  const content = `Saved attachment article.\n\n![Pending image](asset://${key})`;
  await desktopWindow.evaluate(async body => {
    await window.__folioleWorkspaceDebug?.seedNodes(Array.from({ length: 128 }, (_, i) => ({
      id: `preparation-${i}`, kind: 'topic' as const, title: `Attachment article ${i}`, content: body
    })), { persist: true });
  }, content);
  const preparing = desktopSession.electronApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const { createDesktopRequestSyncDatabaseHost } = require(`${process.cwd()}/dist/electron/sync/desktopRequestSyncDatabaseHost.js`);
    const { withRequestSyncAttachmentPreparation } = require(`${process.cwd()}/dist/lib/core/sync/requestSyncAttachmentPreparation.js`);
    const dbPath = await connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().dbPath);
    if (!dbPath.includes('foliole-playwright')) throw new Error('Expected an isolated test library');
    const timings: { phase: string; durationMs: number }[] = [];
    const host = createDesktopRequestSyncDatabaseHost(dbPath, undefined, undefined,
      (phase: string, durationMs: number) => timings.push({ phase, durationMs }));
    const startedAt = performance.now();
    await withRequestSyncAttachmentPreparation(host, undefined, async (prepared: {
      attachmentArticlesCommitted(ids: string[]): void;
    }) => prepared.attachmentArticlesCommitted(Array.from({ length: 128 }, (_, i) => `preparation-${i}`)));
    return { durationMs: performance.now() - startedAt, timings,
      demand: await host.readSnapshot((db: { query(sql: string): Promise<unknown> }) => db.query(
        "SELECT count(*) AS count FROM attachment_pending WHERE article_id LIKE 'preparation-%'")) };
  });
  const foregroundAt = Date.now();
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.openNode('preparation-0'));
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(content);
  const foregroundMs = Date.now() - foregroundAt;
  const result = await preparing;
  expect(result.demand).toEqual([{ count: 128 }]);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.openNode('preparation-0'));
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(content);
  const root = path.resolve('.tmp/artifacts/T626');
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'native-attachment-preparation.json'), JSON.stringify({ ...result, foregroundMs }, null, 2));
});
