import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { test, expect } from './harness/fixtures';

test('writes logs during recording, keeps past files, and reveals the latest from About', async ({ desktopApp, desktopWindow }) => {
  const directory = await desktopApp.evaluate(({ app, shell }) => {
    const results: string[] = [];
    globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__ = results;
    shell.showItemInFolder = filePath => { results.push(filePath); };
    return app.getPath('userData');
  });
  const appLogs = path.join(directory, 'logs');
  await desktopApp.evaluate(({ app }, logsPath) => app.setAppLogsPath(logsPath), appLogs);
  const logs = path.join(appLogs, 'support-recordings');

  await desktopWindow.getByRole('button', { name: /^(Settings|设置)$/ }).click();
  const settings = desktopWindow.getByRole('dialog').filter({
    has: desktopWindow.getByRole('button', { name: /^(About|关于)$/ })
  });
  await settings.getByRole('button', { name: /^(About|关于)$/ }).click();
  const description = settings.getByText(/^(Record application logs to help identify issues\.|记录应用运行日志，便于定位问题。)$/);
  await expect(description).toBeVisible();
  await settings.getByRole('button', { name: /^(Start recording|开始记录)$/ }).click();
  const stop = settings.getByRole('button', { name: /^(Stop recording|停止记录)$/ });
  await expect(stop).toBeEnabled();
  await expect(description).toBeVisible();

  await desktopWindow.evaluate(() => window.electronAPI!.logDiagnosticEvent!({
    event: 'test.log.captured', level: 'info', source: 'desktop-test', payload: { bodyTextSample: 'private canary' }
  }));
  const [first] = await readdir(logs);
  const written = await readFile(path.join(logs, first!), 'utf8');
  expect(written).toContain('test.log.captured');
  expect(written).toContain('Recent errors and warnings:');
  expect(written).toContain('Crash reports:');
  expect(written).not.toContain('private canary');

  await stop.click();
  const restart = settings.getByRole('button', { name: /^(Record again|重新记录)$/ });
  await restart.click();
  await stop.click();
  await settings.getByRole('button', { name: /^(Open log|打开日志)$/ }).click();
  const second = (await readdir(logs)).find(file => file !== first);
  expect(second).toBeDefined();
  await expect.poll(() =>
    desktopApp.evaluate(() => globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__)
  ).toEqual([path.join(logs, second!)]);
  expect(await readFile(path.join(logs, first!), 'utf8')).toContain('test.log.captured');
});
