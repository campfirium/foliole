import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserWindow, OpenDialogOptions } from 'electron';

import { expect, test } from './harness/fixtures';
import { card, loadSource, openPreview, parameters, writeCollection } from './harness/superMemoImport';

const chooseAgain = /^(Choose again|重新选择)$/;
const oneCard = `<SuperMemoCollection><Count>1</Count>${card}</SuperMemoCollection>`;

for (const kind of ['file', 'folder'] as const) {
  test(`reopens the system picker after an unreadable import ${kind}`, async ({ desktopWindow, desktopApp }, testInfo) => {
    // SKIP: this fixture uses POSIX access bits | 2026-11-17 | revive: use a Windows ACL denial fixture
    test.skip(process.platform === 'win32' || process.getuid?.() === 0);
    const directory = testInfo.outputPath('source');
    const name = `Recovered ${kind}`;
    const file = path.join(directory, `${name}.md`);
    await mkdir(directory, { recursive: true });
    await writeFile(file, `# ${name}\n\nBody after access is restored.`);
    const selected = kind === 'file' ? file : directory;
    const originalMode = kind === 'file' ? 0o644 : 0o755;
    await chmod(selected, kind === 'file' ? 0o000 : 0o100);
    try {
      await desktopApp.evaluate(({ dialog }, selectedPath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
      }, selected);
      await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
      const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
      await palette.getByRole('button', { name: kind === 'file' ? /^(Import Files|导入文件)$/ : /^(Import Folder|导入文件夹)$/ }).click();
      const notice = desktopWindow.getByRole('dialog', { name: /^(Foliole could not access the import source|Foliole 无权访问导入来源)$/ });
      await expect(notice).toBeVisible();
      if (kind === 'file') await expect(notice.getByText(`${name}.md`, { exact: true })).toBeVisible();
      if (process.platform === 'darwin') {
        await expect(notice.getByRole('button', { name: /^(Open System Settings|打开系统设置)$/ })).toBeVisible();
      }
      await notice.screenshot({ path: testInfo.outputPath(`${kind}-access.png`) });
      await chmod(selected, originalMode);
      await notice.getByRole('button', { name: chooseAgain }).click();
      await expect(notice).toBeHidden();
      await expect.poll(() => desktopWindow.evaluate(async title => {
        const snapshot = await window.electronAPI!.invoke('load_workspace_snapshot');
        return Object.values(snapshot.nodesById).filter(node => node.title === title).length;
      }, name)).toBe(1);
    } finally {
      await chmod(selected, originalMode);
    }
  });
}

test('reports SuperMemo XML permission failures and retries from the picker', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  // SKIP: this fixture uses POSIX access bits | 2026-11-17 | revive: use a Windows ACL denial fixture
  test.skip(process.platform === 'win32' || process.getuid?.() === 0);
  const source = testInfo.outputPath('Export');
  const xml = path.join(source, 'Export.xml');
  await mkdir(source, { recursive: true });
  await writeFile(xml, oneCard);
  await chmod(xml, 0o000);
  try {
    await loadSource(desktopApp, dialog, source);
    const notice = desktopWindow.getByRole('dialog', { name: /^(Could not load SuperMemo|无法载入 SuperMemo)$/ });
    await expect(notice.getByText(/does not have permission to read the selected XML|无权读取所选的 XML/)).toBeVisible();
    await chmod(xml, 0o644);
    await notice.getByRole('button', { name: chooseAgain }).click();
    await expect(dialog.getByRole('button', { name: /Card.*#2/ })).toBeVisible();
  } finally {
    await chmod(xml, 0o644);
  }
});

for (const recovery of ['paired', 'xml-only'] as const) {
  test(`opens the folder picker on SuperMemo access denial and previews ${recovery}`, async ({ desktopWindow, desktopApp }, testInfo) => {
    // SKIP: this fixture uses POSIX access bits | 2026-11-17 | revive: use a Windows ACL denial fixture
    test.skip(process.platform === 'win32' || process.getuid?.() === 0);
    const dialog = await openPreview(desktopWindow);
    const directory = testInfo.outputPath('Export');
    const collection = path.join(directory, 'Export');
    const table = path.join(collection, 'info', 'ElementInfo.dat');
    const xml = path.join(directory, 'Export.xml');
    await writeCollection(collection, false);
    await writeFile(xml, oneCard);
    await chmod(table, 0o000);
    try {
      await desktopApp.evaluate(({ dialog: picker }, { xml, collection, table, recovery }) => {
        picker.showOpenDialog = async (first: BrowserWindow | OpenDialogOptions, second?: OpenDialogOptions) => {
          const options = second ?? first as OpenDialogOptions;
          if (!options.properties?.includes('openDirectory')) return { canceled: false, filePaths: [xml] };
          if (recovery === 'xml-only') return { canceled: true, filePaths: [] };
          await process.getBuiltinModule('node:fs/promises')!.chmod(table, 0o644);
          return { canceled: false, filePaths: [collection] };
        };
      }, { xml, collection, table, recovery });
      await dialog.getByRole('button', { name: /^(Load XML|载入 XML)$/ }).click();
      await expect(dialog.getByRole('button', { name: /Card.*#2/ })).toBeVisible();
      await dialog.getByRole('button', { name: parameters }).click();
      const dateBasis = dialog.getByText(/Candidate dates and priority order come from|候选日期和优先顺序来自/);
      await expect(dateBasis).toHaveCount(recovery === 'paired' ? 1 : 0);
    } finally {
      await chmod(table, 0o644);
    }
  });
}

for (const recovery of ['paired', 'xml-only', 'ambiguous'] as const) {
  test(`picks the original location before opening a SuperMemo preview for ${recovery}`, async ({ desktopWindow, desktopApp }, testInfo) => {
    const dialog = await openPreview(desktopWindow);
    const directory = testInfo.outputPath('Export');
    const location = testInfo.outputPath('Original collections');
    await writeCollection(path.join(location, 'Learning'), false);
    if (recovery === 'ambiguous') await writeCollection(path.join(location, 'Learning backup'), false);
    await loadSource(desktopApp, dialog, directory, oneCard, undefined, recovery === 'xml-only' ? undefined : location);
    if (recovery === 'ambiguous') {
      const choices = desktopWindow.getByRole('dialog', { name: /^(Choose a SuperMemo collection|选择 SuperMemo 集合)$/ });
      await expect(choices.getByRole('button', { name: 'Learning backup' })).toBeVisible();
      await choices.getByRole('button', { name: 'Learning', exact: true }).click();
    }
    await expect(dialog.getByRole('button', { name: /Card.*#2/ })).toBeVisible();
    await dialog.getByRole('button', { name: parameters }).click();
    const dateBasis = dialog.getByText(/Candidate dates and priority order come from|候选日期和优先顺序来自/);
    await expect(dateBasis).toHaveCount(recovery === 'xml-only' ? 0 : 1);
    await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
    await expect(dialog.getByText(/^(Imported 1|已导入 1 条)/)).toBeVisible();
  });
}
