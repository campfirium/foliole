import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const PRIVATE_BOOK = '/Volumes/Private Shelf/某本书.epub';

test('feedback carries the redacted reason of a real native import failure', async ({ desktopApp, desktopWindow }) => {
  const userData = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  await desktopApp.evaluate(({ app }, logsPath) => app.setAppLogsPath(logsPath), path.join(userData, 'logs'));
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const failure = await desktopWindow.evaluate(async (filePath) => {
    try {
      await window.electronAPI!.invoke('run_text_file_import', { file_path: filePath });
      return 'resolved';
    } catch (error) {
      return String(error);
    }
  }, PRIVATE_BOOK);
  expect(failure).toContain('ENOENT');

  let sentMessage = '';
  await desktopWindow.route('**/*', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sentMessage = (JSON.parse(route.request().postData() ?? '{}') as { message?: string }).message ?? '';
    return route.fulfill({ json: { ok: true } });
  });
  await desktopWindow.getByRole('button', { name: 'Send Feedback', exact: true }).click();
  const option = desktopWindow.getByLabel('Include recent error details (personal details removed)');
  await expect(option).toBeChecked();
  await desktopWindow.getByRole('textbox', { name: 'Feedback', exact: true }).fill('EPUB import fails; intercepted, never sent.');
  await desktopWindow.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(desktopWindow.getByRole('button', { name: 'Done', exact: true })).toBeVisible();

  expect(sentMessage.startsWith('EPUB import fails; intercepted, never sent.\n\n---\n')).toBe(true);
  expect(sentMessage).toContain('"command":"run_text_file_import"');
  expect(sentMessage).toContain('ENOENT');
  expect(sentMessage).not.toContain('某本书');
  expect(sentMessage).not.toContain('Private Shelf');
});
