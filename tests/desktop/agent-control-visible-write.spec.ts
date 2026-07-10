import fs from 'node:fs/promises';
import path from 'node:path';

import type { Locator } from '@playwright/test';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const COLLECTION_TITLE = 'Agent Visible Queue';
const UPDATED_COLLECTION_TITLE = 'Agent Visible Queue Updated';
const FIRST_TOPIC_TITLE = 'Agent Visible Memo A';
const SECOND_TOPIC_TITLE = 'Agent Visible Memo B';
const UPDATED_FIRST_TOPIC_TITLE = 'Agent Visible Memo A Updated';

type DesktopWindow = Parameters<typeof expectWorkspaceShell>[0];

async function readJson(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
}

async function readDescriptor(filePath: string) {
  await expect.poll(async () => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }, { timeout: 5000 }).toBe(true);
  return readJson(filePath);
}

async function createTopicFromUi(desktopWindow: DesktopWindow, content: string) {
  await desktopWindow.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  const previousNodeId = await desktopWindow.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  await desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect.poll(() => desktopWindow.evaluate((previous) => {
    const nodeId = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
    return nodeId && nodeId !== previous ? nodeId : null;
  }, previousNodeId)).not.toBeNull();
  const nodeId = await desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  expect(nodeId).toBeTruthy();
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0) ?? false)).toBe(true);
  await desktopWindow.locator('.prompt-editor-host .cm-content').click();
  await desktopWindow.keyboard.insertText(content);
  await expect.poll(() => desktopWindow.evaluate((targetNodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNode?.(targetNodeId)?.content ?? null, nodeId)).toBe(content);
  return nodeId!;
}

async function runCli(command: string[]) {
  const result = await runAgentCli(command);
  expect(result.status).toBe(0);
  return result.output as Record<string, unknown>;
}

async function readMaterial(descriptorPath: string, id: string) {
  const output = await runCli(['materials/read', '--descriptor', descriptorPath, '--id', id]);
  return output.material as Record<string, unknown>;
}

async function verifyMaterialLifecycle(args: {
  contentPanel: Locator;
  descriptorPath: string;
  firstTopicId: string;
  secondTopicId: string;
}) {
  const firstMaterial = await readMaterial(args.descriptorPath, args.firstTopicId);
  await runCli([
    'materials/update', '--descriptor', args.descriptorPath, '--id', args.firstTopicId,
    '--expected-updated-at', String(firstMaterial.updated_at), '--title', UPDATED_FIRST_TOPIC_TITLE,
    '--content', '# Agent Visible Memo A Updated\n\nUpdated body A',
    '--backup-dir', path.join('.tmp', 'artifacts', 'agent-control-visible-write-backups')
  ]);
  await expect(args.contentPanel.getByRole('treeitem', { name: UPDATED_FIRST_TOPIC_TITLE })).toBeVisible({ timeout: 10_000 });
  const secondMaterial = await readMaterial(args.descriptorPath, args.secondTopicId);
  const deletedMaterial = await runCli([
    'materials/delete-soft', '--descriptor', args.descriptorPath, '--id', args.secondTopicId,
    '--expected-updated-at', String(secondMaterial.updated_at),
    '--backup-dir', path.join('.tmp', 'artifacts', 'agent-control-visible-write-backups')
  ]);
  await expect(args.contentPanel.getByRole('treeitem', { name: SECOND_TOPIC_TITLE })).toHaveCount(0, { timeout: 10_000 });
  await runCli([
    'materials/restore', '--descriptor', args.descriptorPath, '--id', args.secondTopicId,
    '--expected-updated-at', String(deletedMaterial.deleted_at),
    '--backup-dir', path.join('.tmp', 'artifacts', 'agent-control-visible-write-backups')
  ]);
  await expect(args.contentPanel.getByRole('treeitem', { name: SECOND_TOPIC_TITLE })).toBeVisible({ timeout: 10_000 });
}

async function verifyVirtualFolderLifecycle(desktopWindow: DesktopWindow, descriptorPath: string, folderId: string) {
  const folder = (await runCli([
    'virtual-folders/read', '--descriptor', descriptorPath, '--id', folderId
  ])).folder as Record<string, unknown>;
  const updatedFolder = await runCli([
    'virtual-folders/update', '--descriptor', descriptorPath, '--id', folderId,
    '--expected-updated-at', String(folder.updated_at), '--title', UPDATED_COLLECTION_TITLE,
    '--backup-dir', path.join('.tmp', 'artifacts', 'agent-control-visible-write-backups')
  ]);
  const updatedRow = desktopWindow.getByRole('treeitem', { name: new RegExp(UPDATED_COLLECTION_TITLE) });
  await expect(updatedRow).toBeVisible({ timeout: 10_000 });
  const deletedFolder = await runCli([
    'virtual-folders/delete-soft', '--descriptor', descriptorPath, '--id', folderId,
    '--expected-updated-at', String(updatedFolder.updated_at),
    '--backup-dir', path.join('.tmp', 'artifacts', 'agent-control-visible-write-backups')
  ]);
  await expect(updatedRow).toHaveCount(0, { timeout: 10_000 });
  await runCli([
    'virtual-folders/restore', '--descriptor', descriptorPath, '--id', folderId,
    '--expected-updated-at', String(deletedFolder.deleted_at),
    '--backup-dir', path.join('.tmp', 'artifacts', 'agent-control-visible-write-backups')
  ]);
  await expect(updatedRow).toBeVisible({ timeout: 10_000 });
}

test('Agent Control writes become visible in the desktop Virtual section', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  const userDataPath = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptorPath = path.join(userDataPath, 'cache', 'agent-control-session.json');
  const descriptor = await readDescriptor(descriptorPath);
  expect(descriptor.runtime_identity).toMatchObject({ boot_id: expect.any(String), pid: expect.any(Number) });

  const firstTopicId = await createTopicFromUi(desktopWindow, '# Agent Visible Memo A\n\nOriginal body A');
  const secondTopicId = await createTopicFromUi(desktopWindow, '# Agent Visible Memo B\n\nOriginal body B');
  await expect.poll(async () => (await readMaterial(descriptorPath, firstTopicId)).title).toBe(FIRST_TOPIC_TITLE);
  await expect.poll(async () => (await readMaterial(descriptorPath, secondTopicId)).title).toBe(SECOND_TOPIC_TITLE);

  const created = await runCli([
    'virtual-folders/create',
    '--descriptor', descriptorPath,
    '--title', COLLECTION_TITLE,
    '--description', 'Hidden native visible write'
  ]);
  const folderId = String(created.folder_id);

  await runCli([
    'virtual-folders/add-items',
    '--descriptor', descriptorPath,
    '--folder-id', folderId,
    '--material-ids', `${secondTopicId},${firstTopicId}`
  ]);

  const collectionRow = desktopWindow.getByRole('treeitem', { name: new RegExp(COLLECTION_TITLE) });
  await expect(collectionRow).toBeVisible({ timeout: 10_000 });
  await collectionRow.click();

  const contentPanel = desktopWindow.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  await expect(contentPanel.getByRole('treeitem', { name: SECOND_TOPIC_TITLE })).toBeVisible({ timeout: 10_000 });
  await expect(contentPanel.getByRole('treeitem', { name: FIRST_TOPIC_TITLE })).toBeVisible();
  await expect.poll(() => contentPanel.locator('[role="treeitem"]').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-node-id'))
  )).toEqual([secondTopicId, firstTopicId]);

  await verifyMaterialLifecycle({ contentPanel, descriptorPath, firstTopicId, secondTopicId });
  await verifyVirtualFolderLifecycle(desktopWindow, descriptorPath, folderId);

  await fs.mkdir(path.join('.tmp', 'artifacts'), { recursive: true });
  const screenshotPath = path.resolve('.tmp', 'artifacts', 'agent-control-visible-write.png');
  await desktopWindow.screenshot({ fullPage: true, path: screenshotPath });
  await testInfo.attach('agent-control-visible-write', { path: screenshotPath, contentType: 'image/png' });
});
