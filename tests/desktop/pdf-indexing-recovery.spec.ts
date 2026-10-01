import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { importWorkingSetPdf, openWorkingSetPdf } from './pdf-working-set-fixture';

async function readIndex(app: ElectronApplication, nodeId: string) {
  return app.evaluate(async (_, id) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { openDatabaseConnection, runWithDatabaseConnectionOwner } = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const { readAttachmentLibraryPathSnapshot } = require(`${process.cwd()}/dist/electron/attachments/attachmentLibraryPathSnapshot.js`);
    return runWithDatabaseConnectionOwner(() => {
      const { driver } = openDatabaseConnection();
      const node = driver.queryOne('SELECT resource_references FROM nodes WHERE id = ?', [id]);
      const key = JSON.parse(node.resource_references).find((entry: { role: string }) => entry.role === 'reference').storage_key;
      const attachmentId = key.slice(0, 64);
      const state = driver.queryOne('SELECT status, attempt, error FROM pdf_index_state WHERE attachment_id = ?', [attachmentId]);
      const pages = driver.queryAll('SELECT page, text FROM pdf_page_text WHERE attachment_id = ? ORDER BY page', [attachmentId]);
      const bytes = require('node:fs').readFileSync(require('node:path').join(readAttachmentLibraryPathSnapshot().assetsDir, key));
      return { ...state, pages, hash: require('node:crypto').createHash('sha256').update(bytes).digest('hex') };
    });
  }, nodeId);
}

test('PDF indexing completes or fails durably and survives a native relaunch', async ({ desktopSession, desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const validPath = path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf');
  const invalidPath = path.resolve('tests/desktop/fixtures/pdf-invalid-user-journey.pdf');
  const readyId = await importWorkingSetPdf(desktopApp, desktopWindow, validPath);
  const failedId = await importWorkingSetPdf(desktopApp, desktopWindow, invalidPath);
  await expect.poll(() => readIndex(desktopApp, readyId)).toMatchObject({ status: 'ready', attempt: 1, error: null });
  await expect.poll(() => readIndex(desktopApp, failedId)).toMatchObject({ status: 'failed', attempt: 3 });
  const ready = await readIndex(desktopApp, readyId);
  const failed = await readIndex(desktopApp, failedId);
  expect(ready.pages).toHaveLength(3);
  expect(failed.pages).toEqual([]);
  expect(failed.error).toBeTruthy();
  expect(ready.hash).toBe(createHash('sha256').update(fs.readFileSync(validPath)).digest('hex'));
  expect(failed.hash).toBe(createHash('sha256').update(fs.readFileSync(invalidPath)).digest('hex'));
  await openWorkingSetPdf(desktopWindow, readyId);
  await expect(desktopWindow.getByTestId('pdf-document-surface')).toContainText('Foliole PDF User Journey Page 1');
  await desktopWindow.screenshot({ path: testInfo.outputPath('pdf-index-ready.png') });
  // Seed the persisted boundary left by an interrupted indexing attempt.
  await desktopApp.evaluate(async (_, id) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { openDatabaseConnection, runWithDatabaseConnectionOwner } = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return runWithDatabaseConnectionOwner(() => {
      const { driver } = openDatabaseConnection();
      const node = driver.queryOne('SELECT resource_references FROM nodes WHERE id = ?', [id]);
      const key = JSON.parse(node.resource_references).find((entry: { role: string }) => entry.role === 'reference').storage_key;
      driver.execute("UPDATE pdf_index_state SET status = 'indexing' WHERE attachment_id = ?", [key.slice(0, 64)]);
    });
  }, readyId);
  expect(await readIndex(desktopApp, readyId)).toMatchObject({ status: 'indexing', attempt: 1 });
  const stateRoot = desktopSession.target.runtimeStateRoot;
  await desktopApp.close();
  const restarted = await launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot } });
  try {
    await expectWorkspaceShell(restarted.firstWindow);
    await expect.poll(() => readIndex(restarted.electronApp, readyId)).toEqual({ ...ready, attempt: 2 });
    expect(await readIndex(restarted.electronApp, failedId)).toEqual(failed);
    await openWorkingSetPdf(restarted.firstWindow, readyId);
    await expect(restarted.firstWindow.getByTestId('pdf-document-surface')).toContainText('Foliole PDF User Journey Page 1');
    await restarted.firstWindow.screenshot({ path: testInfo.outputPath('pdf-index-restarted.png') });
    await testInfo.attach('pdf-index-durable-results', { body: JSON.stringify({ ready, failed }), contentType: 'application/json' });
  } finally { await restarted.close(); }
});
