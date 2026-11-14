import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const material = /^(Rewrite: Clarify Understanding|改写：澄清理解)$/;
const sample = /^(Welcome to Foliole|欢迎使用 Foliole)$/;
const enterFlow = /^(Enter Flow|进入 Flow)$/;
const exitFlow = /^(Exit Flow|退出 Flow)$/;
const branches = ['Reference branch A', 'Reference branch B', 'Reference branch C'];

async function seedBranches(page: Page) {
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async (titles) => {
    localStorage.setItem('foliole-app-language', 'en');
    const now = new Date().toISOString();
    const base = { kind: 'topic' as const, isTitleManual: true, content: 'Reference text',
      reveal: null, position: null, anchorLink: null, createdAt: now, updatedAt: now };
    for (const [index, title] of titles.entries()) {
      const nodeId = `sidebar-branch-${index}`;
      const parentNodeId = index === 2 ? 'sidebar-branch-0' : 'special-inbox';
      await window.electronAPI.invoke('create_topic', { ...base, nodeId, parentNodeId, title });
      await window.electronAPI.invoke('create_topic', {
        ...base, nodeId: `${nodeId}-child`, parentNodeId: nodeId, title: `${title} child`
      });
    }
  }, branches);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
}

const activeNode = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId());
const reviewSession = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());

async function moveFlowToMaterial(page: Page, id: string) {
  if (await page.getByRole('button', { name: enterFlow }).isVisible()) {
    await page.getByRole('button', { name: enterFlow }).click();
  }
  await expect(page.getByRole('button', { name: exitFlow })).toBeVisible();
  for (let step = 0; step < 12; step++) {
    const { currentNodeId } = await reviewSession(page);
    if (currentNodeId === id) return;
    const soon = page.getByRole('button', { name: 'Soon', exact: true });
    const read = page.getByRole('button', { name: 'Read', exact: true });
    if (await soon.isVisible()) await soon.click();
    else if (await read.isVisible()) await read.click();
    else {
      const reveal = page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ });
      if (await reveal.isVisible()) await reveal.click();
      await page.getByRole('button', { name: 'Good', exact: true }).click();
    }
    await expect.poll(async () => (await reviewSession(page)).currentNodeId).not.toBe(currentNodeId);
  }
  expect((await reviewSession(page)).currentNodeId).toBe(id);
}

async function prepareBranchStates(left: Locator) {
  for (const title of branches) {
    const branch = left.getByRole('treeitem', { name: title, exact: true });
    await expect(branch).toBeVisible();
    if (await branch.getAttribute('aria-expanded') === 'false') {
      await branch.locator('[data-node-tree-chevron]').click();
    }
    await expect(left.getByRole('treeitem', { name: `${title} child`, exact: true })).toBeVisible();
  }
  await left.getByRole('treeitem', { name: branches[2], exact: true }).locator('[data-node-tree-chevron]').click();
}

async function expectBranchStates(left: Locator) {
  for (const [index, title] of branches.entries()) {
    const expanded = index < 2;
    await expect.soft(left.getByRole('treeitem', { name: title, exact: true })).toHaveAttribute('aria-expanded', String(expanded));
    const child = left.getByRole('treeitem', { name: `${title} child`, exact: true });
    if (expanded) await expect.soft(child).toBeVisible();
    else await expect.soft(child).toBeHidden();
  }
}

async function toggleImmersive(page: Page, command: 'Enter' | 'Exit') {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const title = `${command} Immersive Reading`;
  await palette.getByRole('textbox', { name: 'Search commands' }).fill(title);
  await palette.getByRole('button', { name: title, exact: true }).click();
  await expect(palette).toBeHidden();
}

for (const mode of ['browse', 'flow'] as const) {
  test(`keeps manually expanded and collapsed sidebar branches through immersive reading in ${mode}`, async ({ desktopWindow: page }, testInfo) => {
    await seedBranches(page);
    const id = await page.evaluate((pattern) =>
      window.__folioleWorkspaceDebug!.listNodes().find(node => new RegExp(pattern).test(node.title))?.id, material.source);
    if (!id) throw new Error('Expected the sample material in the isolated library');
    const left = page.locator('[data-workspace-side-column="list"]');
    const currentRow = left.getByRole('treeitem', { name: material }).first();
    if (mode === 'flow') {
      await moveFlowToMaterial(page, id);
    } else {
      const exit = page.getByRole('button', { name: exitFlow });
      if (await exit.isVisible()) await exit.click();
      const root = left.getByRole('treeitem', { name: sample }).first();
      if (await root.getAttribute('aria-expanded') === 'false') await root.locator('[data-node-tree-chevron]').click();
      await currentRow.click();
    }

    await prepareBranchStates(left);
    await expectBranchStates(left);
    await expect(currentRow).toBeVisible();
    await expect.poll(() => activeNode(page)).toBe(id);
    const queue = await reviewSession(page);
    if (mode === 'flow') expect(queue.currentNodeId).toBe(id);
    await page.screenshot({ path: testInfo.outputPath('before.png') });

    await toggleImmersive(page, 'Enter');
    await expect(left).toBeHidden();
    expect(await activeNode(page)).toBe(id);
    expect(await reviewSession(page)).toEqual(queue);
    await page.screenshot({ path: testInfo.outputPath('immersive.png') });

    await toggleImmersive(page, 'Exit');
    await expect(left).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('after.png') });
    await expectBranchStates(left);
    await expect.soft(currentRow).toBeVisible();
    await expect.poll(() => activeNode(page)).toBe(id);
    expect(await reviewSession(page)).toEqual(queue);
  });
}
