import { test, expect } from './harness/fixtures';

test('shows the support email tooltip in About settings', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.getByRole('button', { name: /^(Settings|设置)$/ }).click();
  const settingsDialog = desktopWindow.getByRole('dialog').filter({
    has: desktopWindow.getByRole('button', { name: /^(About|关于)$/ })
  });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole('button', { name: /^(About|关于)$/ }).click();
  const emailButton = settingsDialog.getByRole('button', { name: /^(Email|邮件联系)$/ });

  await expect(emailButton).toBeEnabled();
  await expect(emailButton).toHaveAttribute('title', 'hello@foliole.app');
  await emailButton.hover();

  const tooltip = desktopWindow.getByRole('tooltip', { name: 'hello@foliole.app' });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText('hello@foliole.app');
  await testInfo.attach('about-email-tooltip', {
    body: await desktopWindow.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});
