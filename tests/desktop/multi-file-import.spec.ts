import fs from 'node:fs/promises';
import path from 'node:path';

import { createDegradedMultiChapterBookEpub, createMultiChapterBookEpub } from '../../electron/import/readwiseBooksEndToEnd.fixture';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('imports all selected chapters and retains their bodies after reload', async ({ desktopApp, desktopWindow }) => {
  const artifacts = path.resolve('.tmp/artifacts/issue-275');
  await fs.mkdir(artifacts, { recursive: true });
  const files = [path.join(artifacts, 'chapter-one.md'), path.join(artifacts, 'chapter-two.txt')];
  const bodies = ['First selected chapter complete body', 'Second selected chapter complete body'];
  await Promise.all(files.map((file, index) => fs.writeFile(file, bodies[index]!)));
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await desktopApp.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
  }, files);
  await desktopWindow.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(() => desktopWindow.evaluate(async () => {
    const overview = await window.electronAPI!.invoke('load_import_overview', {});
    return overview.recent_runs.filter((run) => run.source_name.startsWith('chapter-')).length;
  })).toBe(2);
  const imported = await desktopWindow.evaluate(async () => {
    const overview = await window.electronAPI!.invoke('load_import_overview', {});
    return overview.recent_runs.filter((run) => run.source_name.startsWith('chapter-'));
  });
  for (const run of imported) {
    expect(run.result_status).toBe('imported');
    await expect.poll(() => desktopWindow.evaluate((id) =>
      Boolean(window.__folioleWorkspaceDebug?.getNode(id!)), run.node_id)).toBe(true);
  }
  for (const reload of [false, true]) {
    if (reload) {
      await desktopWindow.reload();
      await expectWorkspaceShell(desktopWindow);
      await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
    }
    for (const run of imported) {
      const index = files.findIndex((file) => path.basename(file) === run.source_name);
      expect(await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id!), run.node_id)).toBe(true);
      await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText(bodies[index]!);
    }
  }
  for (const [index, file] of files.entries()) expect(await fs.readFile(file, 'utf8')).toBe(bodies[index]);
});

test('imports a mixed batch past a failed text file and keeps each EPUB reading choice', async ({
  desktopApp, desktopWindow
}) => {
  const artifacts = path.resolve('.tmp/artifacts/issue-275-mixed');
  await fs.mkdir(artifacts, { recursive: true });
  const firstBook = await createMultiChapterBookEpub(artifacts, 'batch-first.epub');
  const lastBook = await createDegradedMultiChapterBookEpub(artifacts, 'batch-last.epub');
  const broken = path.join(artifacts, 'batch-broken.txt');
  const text = path.join(artifacts, 'batch-note.txt');
  await fs.writeFile(broken, Buffer.from([0xef, 0xbb, 0xbf, 0xe4, 0xb8]));
  await fs.writeFile(text, 'Mixed batch note remains readable');
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await desktopApp.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
  }, [firstBook, broken, text, lastBook]);
  await desktopWindow.getByRole('button', { name: 'Import', exact: true }).click();
  const modeDialog = desktopWindow.getByRole('dialog', { name: 'Choose reading mode' });
  await expect(modeDialog).toBeVisible();
  await modeDialog.getByRole('button', { name: /^Sequential reading/ }).click();
  await expect.poll(() => desktopWindow.evaluate(async () => {
    const overview = await window.electronAPI!.invoke('load_import_overview', {});
    return overview.recent_runs.filter((run) => run.source_name.startsWith('batch-')).length;
  })).toBe(4);
  await expect(modeDialog).toBeVisible();
  await modeDialog.getByRole('button', { name: /^Free reading/ }).click();
  await expect(modeDialog).toBeHidden();
  for (const reload of [false, true]) {
    if (reload) {
      await desktopWindow.reload();
      await expectWorkspaceShell(desktopWindow);
      await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
    }
    const result = await desktopWindow.evaluate(async () => {
      const overview = await window.electronAPI!.invoke('load_import_overview', {});
      const snapshot = await window.electronAPI!.invoke('load_workspace_snapshot', {});
      return overview.recent_runs.filter((run) => run.source_name.startsWith('batch-')).map((run) => ({
        name: run.source_name,
        status: run.result_status,
        sequential: run.node_id ? snapshot.nodesById[run.node_id]?.sequentialReadingEnabled : null,
        node: run.node_id ? window.__folioleWorkspaceDebug!.getNode(run.node_id) : null
      }));
    });
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'batch-broken.txt', status: 'failed', node: null }),
      expect.objectContaining({ name: 'batch-first.epub', sequential: true }),
      expect.objectContaining({ name: 'batch-last.epub', sequential: false })
    ]));
    const note = result.find((run) => run.name === 'batch-note.txt');
    expect(note?.node).toBeTruthy();
    expect(await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id!), note!.node!.id)).toBe(true);
    await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Mixed batch note remains readable');
  }
});
