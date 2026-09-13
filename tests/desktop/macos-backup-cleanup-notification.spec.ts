import { expect, test } from './harness/fixtures';

test('macOS shows the backup cleanup system notification', async ({ desktopApp }) => {
  const result = await desktopApp.evaluate(async ({ app, Notification }) => {
    if (process.platform !== 'darwin') return { locale: app.getLocale(), status: 'wrong-platform' };
    if (!Notification.isSupported()) return { locale: app.getLocale(), status: 'unsupported' };
    const locale = app.getLocale();
    const notification = new Notification({
      body: locale.toLowerCase().startsWith('zh')
        ? '根据保留规则将 3 份较早的备份移到了系统废纸篓。'
        : 'Retention rules moved 3 older backups to the system trash.',
      silent: true,
      title: locale.toLowerCase().startsWith('zh') ? '旧备份已移到废纸篓' : 'Older backups moved to trash'
    });
    const status = await new Promise<string>((resolve) => {
      const timeout = setTimeout(() => resolve('timeout'), 5000);
      notification.once('show', () => {
        clearTimeout(timeout);
        resolve('shown');
      });
      notification.once('failed', (_event, error) => {
        clearTimeout(timeout);
        resolve(`failed:${error}`);
      });
      notification.show();
    });
    return { locale, status };
  });

  expect(result.status).toBe('shown');
});
