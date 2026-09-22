import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/t245-focus');

test('feedback returns keyboard focus after Escape and Done', async ({ desktopWindow }) => {
  fs.mkdirSync(output, { recursive: true });
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const source = desktopWindow.getByRole('button', { name: 'Send Feedback', exact: true });
  await source.focus();
  await desktopWindow.keyboard.press('Enter');
  const dialog = desktopWindow.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (const key of ['Tab', 'Shift+Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab']) {
    await desktopWindow.keyboard.press(key);
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(source).toBeFocused();
  await desktopWindow.screenshot({ path: path.join(output, 'escape-restored.png') });
  await desktopWindow.route('**/*', (route) => route.request().method() === 'POST'
    ? route.fulfill({ json: { ok: true } }) : route.continue());
  await desktopWindow.keyboard.press('Enter');
  await desktopWindow.getByRole('textbox', { name: 'Feedback', exact: true }).fill('Local focus acceptance; intercepted, never sent.');
  await desktopWindow.getByRole('button', { name: 'Send', exact: true }).click();
  const done = desktopWindow.getByRole('button', { name: 'Done', exact: true });
  await expect(done).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await done.focus();
  await desktopWindow.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(source).toBeFocused();
  await desktopWindow.screenshot({ path: path.join(output, 'done-restored.png') });
});
