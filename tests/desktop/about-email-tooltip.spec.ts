import { test, expect } from './harness/fixtures';

test('shows About support and community tooltips', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopApp.evaluate(({ shell }) => {
    const openedUrls: string[] = [];
    globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__ = openedUrls;
    shell.openExternal = async (url: string) => {
      openedUrls.push(url);
    };
  });
  await desktopWindow.getByRole('button', { name: /^(Settings|设置)$/ }).click();
  const settingsDialog = desktopWindow.getByRole('dialog').filter({
    has: desktopWindow.getByRole('button', { name: /^(About|关于)$/ })
  });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole('button', { name: /^(About|关于)$/ }).click();
  await expect(settingsDialog.getByText(/^(Project and community links\.|项目与社区入口。)$/)).toBeVisible();
  const githubButton = settingsDialog.getByRole('button', { name: 'GitHub' });
  const emailButton = settingsDialog.getByRole('button', { name: /^(Email|邮件联系)$/ });

  await githubButton.hover();
  await expect(desktopWindow.getByRole('tooltip', { name: /^(If Foliole helps, a GitHub star means a lot\.|如果 Foliole 对你有帮助，欢迎在 GitHub 上点个 Star。)$/ })).toBeVisible();
  await expect(emailButton).toBeEnabled();
  await expect(emailButton).toHaveAttribute('title', 'hello@foliole.app');
  await emailButton.hover();

  const tooltip = desktopWindow.getByRole('tooltip', { name: 'hello@foliole.app' });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText('hello@foliole.app');
  await emailButton.click();
  await expect.poll(() =>
    desktopApp.evaluate(() => globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__)
  ).toContain('mailto:hello@foliole.app');
  await testInfo.attach('about-email-tooltip', {
    body: await desktopWindow.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});
