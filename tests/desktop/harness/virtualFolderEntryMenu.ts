import fs from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page, TestInfo } from '@playwright/test';

import { runAgentCli } from '../../../scripts/agent-control/foliole-agent.mjs';

import { expect } from './fixtures';

async function runCli(command: string[]) {
  const result = await runAgentCli(command);
  expect(result.status).toBe(0);
  return result.output as Record<string, unknown>;
}

export async function createAgentVirtualFolder(args: {
  descriptorPath: string;
  title: string;
  topicIds: string[];
}) {
  const created = await runCli([
    'virtual-folders/create', '--descriptor', args.descriptorPath, '--title', args.title
  ]);
  const folderId = String(created.folder_id);
  await runCli([
    'virtual-folders/add-items', '--descriptor', args.descriptorPath,
    '--folder-id', folderId, '--material-ids', args.topicIds.join(',')
  ]);
  return folderId;
}

export async function verifyVirtualFolderEntryMenu(args: {
  contentPanel: Locator;
  descriptorPath: string;
  desktopWindow: Page;
  folderId: string;
  testInfo: TestInfo;
  topicId: string;
  topicTitle: string;
}) {
  const topicRow = args.contentPanel.getByRole('treeitem', { name: args.topicTitle });
  await topicRow.click({ button: 'right' });
  await expect(args.desktopWindow.getByRole('menuitem', {
    name: /^(Remove from current virtual folder|从当前虚拟文件夹移除)$/
  })).toBeVisible();
  await expect(args.desktopWindow.getByRole('menuitem', { name: /^(Move to…|移动到\.\.\.)$/ })).toHaveCount(0);
  await expect(args.desktopWindow.getByRole('menuitem', { name: /^(Create Topic|创建主题)$/ })).toHaveCount(0);
  await expect(args.desktopWindow.getByRole('menuitem', { name: /^(Paste as Topic|粘贴为主题)$/ })).toHaveCount(0);
  await expect(args.desktopWindow.getByRole('menuitem', { name: /^(Delete|删除)$/ })).toBeVisible();
  const screenshotPath = path.resolve('.tmp/artifacts/desktop-acceptance/virtual-folder-entry-menu.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await args.desktopWindow.screenshot({ path: screenshotPath });
  await args.testInfo.attach('virtual-folder-entry-menu', { contentType: 'image/png', path: screenshotPath });
  await args.desktopWindow.getByRole('menuitem', {
    name: /^(Remove from current virtual folder|从当前虚拟文件夹移除)$/
  }).click();
  await expect(topicRow).toHaveCount(0);
  await runCli([
    'virtual-folders/add-items', '--descriptor', args.descriptorPath,
    '--folder-id', args.folderId, '--material-ids', args.topicId
  ]);
  await expect(topicRow).toBeVisible({ timeout: 10_000 });
}
