import { writeSuperMemoPriorityCollection } from '../fixtures/superMemoPriorityCollection';

import { expect, test } from './harness/fixtures';
import {
  gradesStep, loadSource, openPreview, openSuperMemoUpdateReview, superMemoImportComplete, superMemoUpdateComplete
} from './harness/superMemoImport';

test('previews and applies a changed priority boundary to an existing batch', async ({ desktopApp, desktopWindow }, info) => {
  const directory = info.outputPath('PriorityUpdate');
  const xml = await writeSuperMemoPriorityCollection(directory);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, directory, xml, undefined, directory);
  await dialog.getByRole('button', { name: gradesStep }).click();
  await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();
  await expect(superMemoImportComplete(desktopWindow)).toBeVisible();
  const card = () => desktopWindow.evaluate(async () => {
    const { nodesById } = await window.electronAPI!.invoke('load_workspace_snapshot');
    return Object.values(nodesById).find(node => node.title === 'Priority 20');
  });
  const original = await card();
  expect(original?.priority).toBe(2);
  await superMemoImportComplete(desktopWindow).press('Escape');

  const existing = await openPreview(desktopWindow);
  await existing.getByRole('button', { name: /^(Priority mapping|优先级映射)$/ }).click();
  const boundary = existing.getByRole('slider', { name: 'Boundary between P2 and P3' });
  await boundary.press('ArrowLeft');
  await boundary.press('ArrowLeft');
  await expect(boundary).toHaveAttribute('aria-valuenow', '20');
  const review = await openSuperMemoUpdateReview(existing);
  const category = review.getByRole('button', { name: /^(Priority changes|优先级变化)\s*\(1\)$/ });
  await category.click();
  await expect(review.getByText('P2 → P3')).toBeVisible();
  expect(await card()).toMatchObject({ id: original?.id, priority: 2 });
  await review.screenshot({ path: info.outputPath('priority-update.png') });
  await review.getByRole('button', { name: /^(Confirm Update|确认更新)$/ }).click();
  await expect(superMemoUpdateComplete(desktopWindow)
    .getByText(/Priorities updated \(1\)|已更新 1 条资料的优先级/)).toBeVisible();
  await expect.poll(card).toMatchObject({ id: original?.id, priority: 3 });
});
