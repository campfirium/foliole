// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createAndroidDevServerLaunch
} from './windows-android-dev-server.mjs';
import {
  selectAndroidDevServerActionWithCommittedFiles
} from './windows-android-dev-server-action.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const normalizePath = (value) => value.replaceAll('\\', '/');

describe('Windows Android dev server', () => {
  it('launches only the companion service as a hidden detached Windows device adapter', () => {
    const launch = createAndroidDevServerLaunch({
      nodePath: 'C:/node/node.exe',
      root: 'D:/repo',
      stateDirectory: 'D:/repo/.tmp/windows-android-dev-server'
    });

    expect(launch.command).toBe('C:/node/node.exe');
    expect(launch.args).toContain('vite.companion.config.ts');
    expect(launch.args).not.toContain('vite.demo.config.ts');
    expect(launch.readyUrl).toBe('http://127.0.0.1:24604/');
    expect(launch.spawnOptions).toMatchObject({ cwd: 'D:/repo', detached: true, shell: false, windowsHide: true });
    expect(normalizePath(launch.paths.state)).toBe('D:/repo/.tmp/windows-android-dev-server/companion.json');
  });

  it('keeps Web diagnosis and device preview on separate package adapters', async () => {
    const packageJson = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(packageJson.scripts['android:web:dev']).toBe('node scripts/android/android-web-dev.mjs');
    expect(packageJson.scripts['android:preview:dev-server']).toBe('bash scripts/android/android-preview-dev-server.sh');
    expect(packageJson.scripts['windows:android:dev-server']).toBe(
      'node scripts/windows/windows-android-dev-server.mjs'
    );
  });

  it('uses path-domain registry facts to classify A5 dev-server update actions', () => {
    const currentStatus = {
      appLaunchResult: 'opened',
      devServerState: 'current',
      installedApkState: 'current',
      ready: true,
      reverseStatus: 'ok'
    };

    expect(selectAndroidDevServerActionWithCommittedFiles({
      changedFiles: ['src/companion/App.tsx'],
      committedFilesSinceRuntime: [],
      currentHead: 'b'.repeat(40),
      status: currentStatus
    })).toMatchObject({ action: 'hot-update' });

    expect(selectAndroidDevServerActionWithCommittedFiles({
      changedFiles: ['scripts/android/windows-dev-server-launch.ps1'],
      committedFilesSinceRuntime: [],
      currentHead: 'b'.repeat(40),
      status: currentStatus
    })).toMatchObject({ action: 'restart-app' });

    expect(selectAndroidDevServerActionWithCommittedFiles({
      changedFiles: ['android/app/build.gradle'],
      committedFilesSinceRuntime: [],
      currentHead: 'b'.repeat(40),
      status: currentStatus
    })).toMatchObject({ action: 'rebuild-install' });
  });
});
