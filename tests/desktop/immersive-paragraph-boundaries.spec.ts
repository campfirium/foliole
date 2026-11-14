import process from 'node:process';

import type { Page } from '@playwright/test';

import { getPlatformDefaultCommandShortcuts } from '../../src/shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../src/shared/commands/ids';
import { formatShortcutLabel } from '../../src/shared/commands/shortcuts';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const materials = ['Earlier', 'Middle', 'Later'].map((name) => ({
  id: `boundary-${name.toLowerCase()}`,
  kind: 'topic' as const,
  title: `${name} material`,
  content: `${name} opening paragraph\n\n${name} closing paragraph`
}));

async function seedMaterials(page: Page) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async (topics) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const api = window.__folioleWorkspaceDebug!;
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await api.deleteNode(node.id);
    }
    await api.seedNodes(topics, { persist: true });
  }, materials);
}

const readState = (page: Page) => page.evaluate(() => {
  const api = window.__folioleWorkspaceDebug!;
  const { currentNodeId, queueNodeIds, cycle, soonNodeIds } = api.getReviewSession();
  return { activeNodeId: api.getActiveNodeId(), currentNodeId, queueNodeIds, cycle, soonNodeIds };
});

async function enterImmersive(page: Page) {
  await page.evaluate(() => window.__folioleDebug?.clearTraces());
  const shortcut = getPlatformDefaultCommandShortcuts({
    platform: process.platform,
    includeBrowserReservedShortcuts: true
  })[APP_COMMAND_IDS.toggleImmersiveMode]!.primary!;
  const key = formatShortcutLabel(shortcut).replace('Cmd+', 'Meta+').replace('Ctrl+', 'Control+');
  await page.keyboard.press(key);
  await expect(page.locator('[data-workspace-side-column="list"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getTraces()
    .some(({ event }) => event === 'runtime.reading-position.applying-complete'))).toBe(true);
}

async function verifyParagraphBoundaries(page: Page, material: typeof materials[number]) {
  const marker = page.locator('.prompt-editor-host .cm-paragraph-marker-line');
  const [opening, closing] = material.content.split('\n\n');
  const initial = await readState(page);
  expect(initial.activeNodeId).toBe(material.id);

  await expect(marker).toHaveText(new RegExp(`^(${opening}|${closing})$`));
  if (await marker.textContent() === closing) {
    await page.keyboard.press('ArrowUp');
  }
  await expect(marker).toHaveText(opening);
  await page.keyboard.press('Space');
  await expect(marker).toHaveText(closing);
  for (const key of ['ArrowDown', 'Space']) {
    await page.keyboard.press(key);
    expect(await readState(page), key).toEqual(initial);
    await expect(marker).toHaveText(closing);
  }

  await page.keyboard.press('ArrowUp');
  await expect(marker).toHaveText(opening);
  for (const key of ['ArrowUp', 'Shift+Space']) {
    await page.keyboard.press(key);
    expect(await readState(page), key).toEqual(initial);
    await expect(marker).toHaveText(opening);
  }

  await page.keyboard.press('ArrowDown');
  await expect(marker).toHaveText(closing);
}

test('paragraph keys stop at the material edges while browsing', async ({ desktopWindow: page }) => {
  await seedMaterials(page);
  await page.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), materials[1].id);
  await expect(page.locator('.prompt-editor-host')).toContainText('Middle opening paragraph');
  await enterImmersive(page);
  await verifyParagraphBoundaries(page, materials[1]);

  await page.keyboard.press('Escape');
  await page.locator('[data-workspace-side-column="list"]').getByText('Later material', { exact: true }).click();
  await expect(page.locator('.prompt-editor-host')).toContainText('Later opening paragraph');
});

test('paragraph keys preserve both the active material and the Flow queue', async ({ desktopApp, desktopWindow: page }) => {
  await seedMaterials(page);
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await page.getByRole('button', { name: 'Change session mode', exact: true }).click();
  await page.getByRole('menuitem', { name: /Reading only/ }).click();
  await expect.poll(async () => (await readState(page)).currentNodeId).toMatch(/^boundary-/);
  const first = (await readState(page)).currentNodeId;
  const read = page.getByRole('button', { name: 'Read', exact: true });
  await read.click();
  await expect.poll(async () => {
    const { currentNodeId } = await readState(page);
    return currentNodeId !== first ? currentNodeId : null;
  }).toMatch(/^boundary-/);
  const initial = await readState(page);
  const material = materials.find(({ id }) => id === initial.currentNodeId)!;
  await expect(page.locator('.prompt-editor-host')).toContainText(material.content.split('\n\n')[0]);
  await enterImmersive(page);
  await verifyParagraphBoundaries(page, material);

  await read.click();
  const next = materials.find(({ id }) => id !== first && id !== material.id)!;
  await expect.poll(() => readState(page)).toMatchObject({
    activeNodeId: next.id,
    currentNodeId: next.id
  });
  await expect(page.locator('.prompt-editor-host')).toContainText(next.content.split('\n\n')[0]);
});
