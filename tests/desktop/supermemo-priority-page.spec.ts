import { writeSuperMemoPriorityCollection } from '../fixtures/superMemoPriorityCollection';

import { relaunchGoldenJourney } from './harness/core-product-golden-journey';
import { expect, test } from './harness/fixtures';
import { gradesStep, loadSource, openPreview, superMemoImportComplete } from './harness/superMemoImport';

test('restores the edited priority mapping after restart and applies it on import', async ({
  desktopSession, desktopWindow, desktopApp
}, info) => {
  const directory = info.outputPath('PriorityMapping');
  const xml = await writeSuperMemoPriorityCollection(directory);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, directory, xml, undefined, directory);
  await dialog.getByRole('button', { name: 'Priority mapping' }).click();
  const boundary = dialog.getByRole('slider', { name: 'Boundary between P2 and P3' });
  await expect(boundary).toHaveAttribute('aria-valuenow', '22');
  await boundary.press('ArrowLeft');
  await boundary.press('ArrowLeft');
  await expect(boundary).toHaveAttribute('aria-valuenow', '20');
  await dialog.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(boundary).toHaveAttribute('aria-valuenow', '22');
  const rail = await dialog.getByRole('group', { name: 'SuperMemo priority (%)' }).boundingBox();
  const handle = await boundary.boundingBox();
  if (!rail || !handle) throw new Error('Priority slider is not visible');
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await desktopWindow.mouse.move(x, y);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(x - rail.width * 0.02, y, { steps: 4 });
  await desktopWindow.mouse.up();
  await expect(boundary).toHaveAttribute('aria-valuenow', '20');

  const restarted = await relaunchGoldenJourney(desktopSession);
  try {
    const reopened = await openPreview(restarted.firstWindow);
    await expect(reopened.getByRole('heading', { name: 'Priority mapping' })).toBeVisible();
    await expect(reopened.getByRole('slider', { name: 'Boundary between P2 and P3' })).toHaveAttribute('aria-valuenow', '20');
    await reopened.screenshot({ path: info.outputPath('priority-mapping.png') });
    await reopened.getByRole('table').scrollIntoViewIfNeeded();
    await reopened.screenshot({ path: info.outputPath('priority-probabilities.png') });
    await reopened.getByRole('button', { name: gradesStep }).click();
    await reopened.getByRole('button', { name: /^(Import|导入)$/ }).click();
    await expect(superMemoImportComplete(restarted.firstWindow)).toBeVisible();
    const priorities = await restarted.firstWindow.evaluate(async () => {
      const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
      return Object.fromEntries(Object.values(nodesById)
        .filter(node => ['Priority 0', 'Priority 10', 'Priority 11', 'Priority 20', 'Priority 100'].includes(node.title))
        .map(node => [node.title, node.priority]));
    });
    expect(priorities).toEqual({ 'Priority 0': 1, 'Priority 10': 1, 'Priority 11': 2, 'Priority 20': 3, 'Priority 100': 9 });
  } finally {
    await restarted.close();
  }
});
