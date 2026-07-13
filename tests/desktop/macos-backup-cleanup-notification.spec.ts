import { expect, test } from './harness/fixtures';

test('macOS shows the backup cleanup system notification', async ({ desktopApp }) => {
  const result = await desktopApp.evaluate(async ({ app, Notification }) => {
    if (process.platform !== 'darwin') return { locale: app.getLocale(), status: 'wrong-platform' };
    if (!Notification.isSupported()) return { locale: app.getLocale(), status: 'unsupported' };
    const locale = app.getLocale();
    const notification = new Notification({
      body: locale.toLowerCase().startsWith('zh')
        ? '根据保留规则删除了 3 份较早的备份，释放 462 MB。'
        : 'Retention rules removed 3 older backups and freed 462 MB.',
      silent: true,
      title: locale.toLowerCase().startsWith('zh') ? '旧备份已清理' : 'Older backups cleaned up'
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
