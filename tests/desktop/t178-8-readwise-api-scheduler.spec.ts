import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Locator, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { connectAndCutoverReadwiseApi, expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');

async function installFixture(app: ElectronApplication) {
  await app.evaluate(({ clipboard }) => {
    const state = globalThis as typeof globalThis & {
      __t178SchedulerBlocked?: boolean;
      __t178SchedulerDocument?: string;
      __t178SchedulerMode?: 'block' | 'fail' | 'normal';
    };
    state.__t178SchedulerDocument = 'article-1';
    state.__t178SchedulerMode = 'normal';
    state.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v2/export/') return Response.json({ nextPageCursor: null, results: [] });
      if (state.__t178SchedulerMode === 'fail') return new Response('{}', { status: 500 });
      if (state.__t178SchedulerMode === 'block') {
        state.__t178SchedulerBlocked = true;
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener(
          'abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }
        ));
      }
      const id = state.__t178SchedulerDocument ?? 'article-1';
      return Response.json({ nextPageCursor: null, results: [{
        category: 'article', html_content: `<p>${id} body</p>`, id, title: id,
        updated_at: '2026-09-08T00:00:00.000Z'
      }] });
    };
    clipboard.writeText('t178-8-token');
  });
}

async function setFixtureMode(
  app: ElectronApplication,
  mode: 'block' | 'fail' | 'normal',
  document = 'article-2'
) {
  await app.evaluate((_electron, input) => {
    const state = globalThis as typeof globalThis & {
      __t178SchedulerBlocked?: boolean; __t178SchedulerDocument?: string; __t178SchedulerMode?: string;
    };
    state.__t178SchedulerBlocked = false;
    state.__t178SchedulerDocument = input.document;
    state.__t178SchedulerMode = input.mode;
  }, { document, mode });
}

async function backdateLastResult(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const settings = require(pathApi.join(process.cwd(), 'dist/electron/database/settingsStore.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      const source = settings.loadJsonSetting('readwise_remote_source');
      settings.saveJsonSetting('readwise_api_schedule_state', {
        connectionRef: source.connectionRef,
        lastResult: {
          completed_at: '2020-01-01T00:00:00.000Z', error_stage: null,
          imported_count: 0, status: 'completed', trigger: 'manual'
        },
        nextRunAt: null,
        version: 1
      });
    });
  });
}

async function sourceCount(app: ElectronApplication) {
  return app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver
      .queryOne("SELECT COUNT(*) count FROM import_sources WHERE remote_provider='readwise'").count);
  });
}

async function forceDue(settings: Locator, app: ElectronApplication) {
  await backdateLastResult(app);
  const frequency = settings.getByLabel(/^(Sync frequency|同步频率)$/);
  await frequency.selectOption('daily');
  await frequency.selectOption('hourly');
}

async function capture(settings: Locator, testInfo: TestInfo) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, `t178-8-readwise-scheduler-${process.platform}.png`);
  await settings.screenshot({ path: target });
  await testInfo.attach('t178-8-readwise-scheduler', { contentType: 'image/png', path: target });
}

test('starts automatically and stops stale work on disconnect', async ({ browserName }, testInfo) => {
  void browserName;
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-8-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await installFixture(session.electronApp);
    await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
    await expectWorkspaceShell(session.firstWindow);
    const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await connectAndCutoverReadwiseApi(session.firstWindow, settings, 'inbox');
    await settings.getByLabel(/^(Sync frequency|同步频率)$/).selectOption('weekly');
    await expect.poll(() => sourceCount(session!.electronApp)).toBe(1);

    await setFixtureMode(session.electronApp, 'normal');
    await forceDue(settings, session.electronApp);
    await expect.poll(() => sourceCount(session!.electronApp)).toBe(2);

    await setFixtureMode(session.electronApp, 'fail');
    await forceDue(settings, session.electronApp);
    await expect.poll(() => session!.electronApp.evaluate(() => {
      const moduleApi = process.getBuiltinModule('module');
      const pathApi = process.getBuiltinModule('path');
      if (!moduleApi || !pathApi) return null;
      const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const settingsStore = require(pathApi.join(process.cwd(), 'dist/electron/database/settingsStore.js'));
      return settingsStore.loadJsonSetting('readwise_api_schedule_state')?.lastResult?.status;
    })).toBe('failed');

    await setFixtureMode(session.electronApp, 'block', 'article-3');
    await forceDue(settings, session.electronApp);
    await expect.poll(() => session!.electronApp.evaluate(() =>
      Boolean((globalThis as typeof globalThis & { __t178SchedulerBlocked?: boolean }).__t178SchedulerBlocked)
    )).toBe(true);
    await settings.getByRole('button', { name: /^(Disconnect|断开)$/ }).click();
    await expect(settings.getByText(/^(Not connected|未连接)$/)).toBeVisible();
    await expect.poll(() => sourceCount(session!.electronApp)).toBe(2);
    await capture(settings, testInfo);
  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
