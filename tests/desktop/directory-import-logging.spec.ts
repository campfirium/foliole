import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';

test('keeps a folder import available when its diagnostic files cannot be written', async ({
  desktopSession, desktopApp, desktopWindow
}) => {
  const root = path.join(desktopSession.target.runtimeStateRoot, 'folder-to-import');
  const logs = path.join(desktopSession.target.runtimeStateRoot, 'unwritable-diagnostic-files');
  const title = 'Directory import with unavailable diagnostics';
  const today = new Date().toISOString().slice(0, 10);
  await mkdir(root, { recursive: true });
  await mkdir(path.join(logs, `runtime-${today}.ndjson`), { recursive: true });
  await writeFile(path.join(logs, 'import'), 'Old import logs cannot be opened here');
  await writeFile(path.join(root, `${title}.md`), '# Directory import test\n\nThe imported body is still readable.');

  await desktopApp.evaluate(({ app, dialog }, input) => {
    app.setAppLogsPath(input.logs);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input.root] });
  }, { root, logs });
  const result = await desktopWindow.evaluate(() => window.electronAPI!.invoke('run_directory_import', {}));
  expect(result).toMatchObject({ discovered_count: 1, imported_count: 1, failed_count: 0 });
  const nodeId = result?.entries[0]?.node_id;
  expect(nodeId).toBeTruthy();
  await desktopWindow.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id!), nodeId);
  await expect(desktopWindow.locator('.prompt-editor-host')).toContainText('The imported body is still readable.');
});
