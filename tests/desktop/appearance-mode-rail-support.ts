import type { Page } from '@playwright/test';

import { expect } from './harness/fixtures';

const APPEARANCE_ACTION = /^(Appearance mode:|外观模式：)/;

// The rail action cycles light, dark, and system modes, so the click count depends on the selection phase.
export async function cycleRailAppearanceTo(page: Page, mode: 'dark' | 'light') {
  const action = page.getByRole('button', { name: APPEARANCE_ACTION });
  const readMode = () => page.evaluate(() => document.documentElement.dataset.baseColor);
  for (let attempt = 0; attempt < 3 && await readMode() !== mode; attempt += 1) {
    const previous = await readMode();
    await action.click();
    await expect.poll(readMode).not.toBe(previous);
  }
  expect(await readMode()).toBe(mode);
}
