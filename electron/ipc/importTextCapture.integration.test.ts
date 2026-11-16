// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir,
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { waitForDatabaseReady } from '../database/databaseReadiness.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { handleGlobalCapturePanelResult } from '../globalClipImportRunner.js';
import { notifyManagedInboxUpdated } from '../import/managedInboxEvents.js';

import { runTextCaptureToInbox } from './importTextCapture.js';

beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-text-capture-'));
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('text-capture-test');
  vi.clearAllMocks();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true });
});

function captureText(text: string) {
  const toast = { close: vi.fn(), update: vi.fn() };
  const presentIssue = vi.fn(async () => true);
  const log = vi.fn();
  const result = handleGlobalCapturePanelResult({
    log,
    panelResult: { type: 'text', text },
    presentIssue,
    runImport: vi.fn(async () => null),
    showDesktopToast: () => toast,
    waitForReady: waitForDatabaseReady
  });
  return { log, presentIssue, result, toast };
}

it.each([false, true])('persists typed capture and the following capture with a competing owner: %s', async (busy) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const owner = busy ? runWithDatabaseConnectionOwner(() => held) : Promise.resolve();
  const capture = captureText('First captured thought');
  try {
    if (busy) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(capture.toast.update).not.toHaveBeenCalled();
      expect(capture.presentIssue).not.toHaveBeenCalled();
      expect(notifyManagedInboxUpdated).not.toHaveBeenCalled();
    }
  } finally {
    release();
    await owner;
    await capture.result;
  }
  const first = await capture.result;
  expect(first).toMatchObject({ node_id: expect.any(String), result_status: 'imported' });
  expect(capture.toast.update).toHaveBeenCalledWith('success', first!.node_id, first!.source_name);
  expect(capture.toast.close).not.toHaveBeenCalled();
  expect(capture.presentIssue).not.toHaveBeenCalled();
  expect(capture.log).not.toHaveBeenCalled();
  expect(first!.node_mutation_patch?.nodes).toEqual(expect.arrayContaining([
    expect.objectContaining({ nodeId: first!.node_id, parentNodeId: 'special-inbox' })
  ]));
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith(first!.import_id, first!.node_mutation_patch);
  const next = captureText('Second captured thought');
  const second = await next.result;
  expect(second?.node_id).toBeTruthy();
  expect(second!.node_id).not.toBe(first!.node_id);
  expect(next.presentIssue).not.toHaveBeenCalled();
  closeDatabaseConnection();
  const driver = openDatabaseConnection().driver;
  for (const [result, text] of [[first, 'First captured thought'], [second, 'Second captured thought']] as const) {
    expect(loadNodeBodyResolution(driver, result!.node_id!)?.content).toContain(text);
    expect(driver.queryOne('SELECT parent_id FROM nodes WHERE id = ?', [result!.node_id!]))
      .toMatchObject({ parent_id: 'special-inbox' });
    expect(driver.queryOne('SELECT node_id FROM import_runs WHERE id = ?', [result!.import_id]))
      .toMatchObject({ node_id: result!.node_id });
  }
});

it('supports capture inside an existing database owner', async () => {
  const result = await runWithDatabaseConnectionOwner(() => runTextCaptureToInbox('Nested thought'));
  expect(loadNodeBodyResolution(openDatabaseConnection().driver, result!.node_id!)?.content)
    .toContain('Nested thought');
});
