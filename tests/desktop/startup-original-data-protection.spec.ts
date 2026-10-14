import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('explains original-data protection on the native startup error page and retains diagnostics', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const error = 'legacy_sync_original_body_unbacked:isolated-topic:original-version';
  const locale = await desktopApp.evaluate(async ({ app, BrowserWindow }, message) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { loadRenderer } = require(`${process.cwd()}/dist/electron/rendererLoader.js`);
    await loadRenderer(BrowserWindow.getAllWindows()[0], `${process.cwd()}/dist/electron`, {
      errorSummary: message, kind: 'startup-error', logPath: '/isolated/diagnostics', moduleLabel: 'Database migration'
    });
    return app.getLocale();
  }, error);
  const explanation = /^zh-(cn|sg|hans)/i.test(locale)
    ? '为保护资料，Foliole 已停止本次升级。'
    : 'To protect your library, Foliole has stopped this upgrade.';
  await expect(desktopWindow.getByRole('alert')).toContainText(explanation);
  await expect(desktopWindow.getByRole('alert')).toContainText(error);
  await expect(desktopWindow.getByRole('alert')).toContainText('/isolated/diagnostics');
  const screenshot = path.resolve('.tmp/artifacts/t343-4/startup-original-data-protection.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('startup-original-data-protection', { path: screenshot, contentType: 'image/png' });
});
