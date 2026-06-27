import { expect } from '@playwright/test';

import { test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

test('does not expose app language selection in settings', async ({ desktopWindow }, testInfo) => {
  const dialog = await openSettingsCategory(desktopWindow, 'General');

  await expect(dialog.getByText('App language')).toHaveCount(0);
  await expect(dialog.getByText('应用语言')).toHaveCount(0);
  await expect(dialog.getByLabel(/^(App language|应用语言)$/)).toHaveCount(0);
  await dialog.screenshot({
    path: testInfo.outputPath('settings-language-hidden.png')
  });
});
