import { readFile } from 'node:fs/promises';

import type { ElectronApplication, Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { confirmStep, gradesStep, loadSource, openPreview, preparePreview, structureStep } from './harness/superMemoImport';

function sourceEntry(dialog: Locator, id: number) {
  return dialog.getByRole('button', { name: new RegExp(`^(?!(?:Expand|Collapse|展开|折叠)).*#${id}(?:\\s|$)`) });
}

function folderSwitch(dialog: Locator, id: number) {
  return dialog.getByRole('switch', { name: new RegExp(`#${id}(?:\\s|$)`) });
}

async function expand(dialog: Locator, id: number) {
  await dialog.getByRole('button', { name: new RegExp(`^(Expand|展开).*\\b${id}$`) }).click();
}

function readBatch(app: ElectronApplication, sourceIds: number[]) {
  return app.evaluate(async ({ app }, wanted) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const { openDatabaseConnection, runWithDatabaseConnectionOwner } = require(`${app.getAppPath()}/database/connection.js`);
    const { readMoveParentOrder } = require(`${app.getAppPath()}/../lib/core/database/nodeMoveStructure.js`);
    await new Promise<void>(resolve => setImmediate(resolve));
    return runWithDatabaseConnectionOwner(() => {
      const { driver, sqlite } = openDatabaseConnection();
      const serialized = sqlite.prepare("SELECT value FROM workspace_meta WHERE key GLOB 'supermemo-import:*'").pluck().get();
      const batch = JSON.parse(serialized) as { rootNodeId: string; entries: Array<{ id: number; nodeId: string | null }> };
      const node = sqlite.prepare('SELECT id, title, kind, content, parent_id AS parent FROM nodes WHERE id = ?');
      return {
        root: batch.rootNodeId,
        nodes: Object.fromEntries(batch.entries.flatMap(({ id, nodeId }) => nodeId && wanted.includes(id)
          ? [[id, { ...node.get(nodeId), children: readMoveParentOrder(driver, nodeId).childIds.map((child: string) => node.get(child)) }]] : []))
      };
    });
  }, sourceIds) as Promise<{ root: string; nodes: Record<number, { id: string; kind: string; title: string;
    parent: string; content: string; children: Array<{ id: string; kind: string; content: string }> }> }>;
}

async function convert(dialog: Locator) {
  await dialog.getByRole('button', { name: confirmStep }).click();
  await dialog.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(dialog.getByText(/Imported \d+|已导入 \d+ 条/)).toBeVisible({ timeout: 120_000 });
}

const document = (dialog: Locator) => dialog.getByRole('region', { name: /^(Preview|预览)$/ });
const xml = `<SuperMemoCollection><Count>6</Count>
  <SuperMemoElement><ID>1</ID><Type>Concept</Type><Title>Archive</Title>
    <Content><Question>Original folder note</Question></Content>
    <SuperMemoElement><ID>7</ID><Type>Topic</Type><Title>Outline</Title>
      <SuperMemoElement><ID>9</ID><Type>Topic</Type><Title>Same title</Title><Content><Question>First chapter</Question></Content></SuperMemoElement>
      <SuperMemoElement><ID>4</ID><Type>Topic</Type><Title>Same title</Title><Content><Question>Second chapter</Question></Content></SuperMemoElement>
    </SuperMemoElement>
    <SuperMemoElement><ID>5</ID><Type>Topic</Type><Title>Document</Title><Content><Question>Parent text</Question></Content>
      <SuperMemoElement><ID>6</ID><Type>Topic</Type><Title>Nested</Title></SuperMemoElement>
    </SuperMemoElement>
  </SuperMemoElement></SuperMemoCollection>`;

test('keeps independent folder choices and writes the previewed hierarchy and bodies', async ({ desktopApp, desktopWindow }, info) => {
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, info.outputPath('Structure'), xml);
  await expect(sourceEntry(dialog, 1)).toBeVisible();
  await expect(sourceEntry(dialog, 7)).toBeHidden();
  await expand(dialog, 1);
  await sourceEntry(dialog, 7).click();
  await expect(document(dialog).getByText(/This entry has no body|此项没有正文/)).toBeVisible();
  await expect(folderSwitch(dialog, 7)).not.toBeChecked();
  await folderSwitch(dialog, 7).click();
  await sourceEntry(dialog, 4).click();
  await expect(document(dialog).getByText('Second chapter')).toBeVisible();
  await expand(dialog, 5);
  await folderSwitch(dialog, 6).click();
  await sourceEntry(dialog, 6).click();
  await expect(document(dialog).getByText(/Archive #1/)).toBeVisible();
  await dialog.getByRole('button', { name: gradesStep }).click();
  await dialog.getByRole('button', { name: structureStep }).click();
  await expect(folderSwitch(dialog, 7)).toBeChecked();
  await expect(folderSwitch(dialog, 6)).toBeChecked();
  await dialog.screenshot({ path: info.outputPath('structure.png') });

  await desktopWindow.reload();
  const restored = await openPreview(desktopWindow);
  await restored.getByRole('button', { name: preparePreview }).click();
  await expect(sourceEntry(restored, 1)).toBeVisible();
  await expand(restored, 1);
  await expect(folderSwitch(restored, 7)).toBeChecked();
  await expand(restored, 5);
  await expect(folderSwitch(restored, 6)).toBeChecked();
  await convert(restored);
  const { nodes } = await readBatch(desktopApp, [1, 7, 9, 4, 5, 6]);
  expect(nodes[7]).toMatchObject({ kind: 'folder', parent: nodes[1]!.id });
  expect(nodes[7]!.children.map(child => child.id)).toEqual([nodes[9]!.id, nodes[4]!.id]);
  expect(nodes[6]).toMatchObject({ kind: 'folder', parent: nodes[1]!.id });
  expect(nodes[1]!.children).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'topic', content: 'Original folder note' })]));
});

const learningXml = process.env.FOLIOLE_SUPERMEMO_VALIDATION_XML;
const learningCollection = process.env.FOLIOLE_SUPERMEMO_VALIDATION_COLLECTION;

async function confirmLearning(dialog: Locator, page: Page) {
  await expect(sourceEntry(dialog, 56)).toBeVisible({ timeout: 90_000 });
  await expect(sourceEntry(dialog, 483)).toBeVisible();
  await expect(folderSwitch(dialog, 483)).toBeChecked();
  await expand(dialog, 56);
  await expect(sourceEntry(dialog, 791)).toBeVisible();
  await expect(sourceEntry(dialog, 1303)).toBeVisible();
  await folderSwitch(dialog, 791).click();
  await folderSwitch(dialog, 1303).click();
  await sourceEntry(dialog, 1441).click();
  await expect(document(dialog).getByText(/#1441/)).toBeVisible();
  await expect(sourceEntry(dialog, 3302)).toContainText('Atomic Habits');
  await expect(sourceEntry(dialog, 825)).toContainText('Atomic Habits');
  await page.getByRole('button', { name: gradesStep }).click();
  await dialog.getByRole('button', { name: structureStep }).click();
  await expect(folderSwitch(dialog, 791)).toBeChecked();
}

test('imports the paired Learning tree by original number and sibling order', async ({ desktopApp, desktopWindow }, info) => {
  // SKIP: requires the private Learning export and collection | 2026-11-17 | revive: supply both validation paths
  test.skip(!learningXml || !learningCollection, 'Requires the private Learning export and collection');
  test.setTimeout(240_000);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, info.outputPath('Learning'), await readFile(learningXml!, 'utf8'), undefined, learningCollection);
  await confirmLearning(dialog, desktopWindow);
  await dialog.screenshot({ path: info.outputPath('learning-structure.png') });
  await convert(dialog);
  const { nodes, root } = await readBatch(desktopApp, [56, 483, 791, 1303, 6, 1441, 3302, 825]);
  expect(nodes[56]).toMatchObject({ kind: 'folder', parent: root });
  expect(nodes[483]).toMatchObject({ kind: 'folder', parent: root });
  expect(nodes[791]).toMatchObject({ kind: 'folder', parent: nodes[56]!.id });
  expect(nodes[1303]).toMatchObject({ kind: 'folder', parent: nodes[56]!.id });
  expect(nodes[791]!.children.map(child => child.id).slice(0, 2)).toEqual([nodes[6]!.id, nodes[1441]!.id]);
  expect([nodes[3302]!.parent, nodes[825]!.parent]).toEqual([nodes[56]!.id, nodes[56]!.id]);
  expect(nodes[3302]!.id).not.toBe(nodes[825]!.id);
});
