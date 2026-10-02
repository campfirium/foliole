import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect } from '@playwright/test';

import { test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

const FIELD_NAME = /^(New item load balancing|新检测项负载均衡)$/;
const REVIEW_CATEGORY = /^(Review|复习)$/;

// Exercise the real desktop bridge and persisted settings through the rendered control.
test('persists the new item balancing window across renderer reload', async ({ desktopWindow }) => {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: REVIEW_CATEGORY }).click();
  await expect(dialog.getByRole('heading', { level: 2, name: REVIEW_CATEGORY })).toBeVisible();
  const input = dialog.getByRole('spinbutton', { name: FIELD_NAME });
  await expect(input).toHaveValue('7');
  await input.fill('1');
  await expect.poll(() => desktopWindow.evaluate(async () => {
    const settings = await window.electronAPI!.invoke('load_review_scheduler_settings') as { newItemLoadBalancingDays: number };
    return settings.newItemLoadBalancingDays;
  })).toBe(1);

  await desktopWindow.reload();
  const reopened = await openSettingsDialog(desktopWindow);
  await reopened.getByRole('button', { name: REVIEW_CATEGORY }).click();
  const restored = reopened.getByRole('spinbutton', { name: FIELD_NAME });
  await expect(restored).toHaveValue('1');
  await restored.fill('99');
  await expect.poll(() => desktopWindow.evaluate(async () => {
    const settings = await window.electronAPI!.invoke('load_review_scheduler_settings') as { newItemLoadBalancingDays: number };
    return settings.newItemLoadBalancingDays;
  })).toBe(99);
  await restored.fill('7');
  await expect(restored).toHaveValue('7');
  await restored.scrollIntoViewIfNeeded();
  await mkdir(path.resolve('.tmp/artifacts/new-item-load-balancing'), { recursive: true });
  await reopened.screenshot({ path: path.resolve('.tmp/artifacts/new-item-load-balancing/settings.png') });
});
