import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { card, loadSource, openPreview, parameters, writeCollection } from './harness/superMemoImport';

const chooseAgain = /^(Choose again|重新选择)$/;
const chooseCollection = /^(Choose collection folder|选择资料库文件夹)$/;
const continueXml = /^(Continue with XML|继续使用 XML)$/;
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
    await desktopWindow.getByRole('dialog', { name: /^(Collection files not found|未找到配套资料)$/ })
      .getByRole('button', { name: continueXml }).click();
    await expect(dialog.getByRole('button', { name: /Card.*#2/ })).toBeVisible();
  } finally {
    await chmod(xml, 0o644);
  }
});

for (const recovery of ['paired', 'xml-only'] as const) {
  test(`converts SuperMemo after choosing ${recovery} recovery without re-reading the broken collection`, async ({ desktopWindow, desktopApp }, testInfo) => {
    const dialog = await openPreview(desktopWindow);
    const directory = testInfo.outputPath('Export');
    const replacement = testInfo.outputPath('Original collection');
    await mkdir(path.join(directory, 'info'), { recursive: true });
    await writeCollection(replacement, false);
    await loadSource(desktopApp, dialog, directory, oneCard);
    const notice = desktopWindow.getByRole('dialog', { name: /^(Could not load SuperMemo|无法载入 SuperMemo)$/ });
    await expect(notice.getByText(/could not read the original collection files|无法读取原资料库的配套文件/)).toBeVisible();
    await notice.screenshot({ path: testInfo.outputPath('supermemo-collection.png') });
    if (recovery === 'paired') {
      await desktopApp.evaluate(({ dialog: picker }, folder) => {
        picker.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      }, replacement);
      await notice.getByRole('button', { name: chooseCollection }).click();
    } else {
      await notice.getByRole('button', { name: continueXml }).click();
    }
    await expect(dialog.getByRole('button', { name: /Card.*#2/ })).toBeVisible();
    await dialog.getByRole('button', { name: parameters }).click();
    const dateBasis = dialog.getByText(/Candidate dates and priority order come from|候选日期和优先顺序来自/);
    await expect(dateBasis).toHaveCount(recovery === 'paired' ? 1 : 0);
    await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
    await expect(dialog.getByText(/^(Imported 1|已导入 1 条)/)).toBeVisible();
  });
}
