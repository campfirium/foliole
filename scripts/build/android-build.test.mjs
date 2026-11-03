import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { androidCliFixture } from './android-cli.fixture.mjs';

const fixtures = [];
function fixture(config) {
  const result = androidCliFixture(config);
  fixtures.push(result);
  return result;
}
afterEach(() => {
  for (const item of fixtures.splice(0)) rmSync(item.root, { recursive: true, force: true });
});

it('runs the public offline build in a checkout without any personal scripts', () => {
  const subject = fixture();
  const result = subject.run('build:android', []);
  expect(result.status, result.stderr).toBe(0);
  expect(subject.calls()).toEqual([
    { tool: 'npm', args: ['run', 'android:web:build'], cwd: subject.root },
    { tool: 'npx', args: ['cap', 'sync', 'android'], cwd: subject.root },
    { tool: 'gradlew', args: ['--no-daemon', 'assembleDebug'], cwd: path.join(subject.root, 'android') }
  ]);
  expect(result.stdout).toContain('ANDROID_DEBUG_APK_READY');
});

it.each(['npm', 'npx', 'gradlew'])('stops a failed %s build without installing a stale APK', (fail) => {
  const subject = fixture({ fail });
  const stale = path.join(subject.root, 'android/app/build/outputs/apk/debug/app-debug.apk');
  mkdirSync(path.dirname(stale), { recursive: true });
  writeFileSync(stale, 'older build');
  const result = subject.run('build:android', []);
  expect(result.status).not.toBe(0);
  expect(result.stdout).not.toContain('ANDROID_DEBUG_APK_READY');
  expect(subject.calls().map(({ tool }) => tool)).toEqual(['npm', 'npx', 'gradlew'].slice(
    0, ['npm', 'npx', 'gradlew'].indexOf(fail) + 1));
  expect(existsSync(stale)).toBe(true);
});

it.each([
  { FOLIOLE_DEV_LIVE_RELOAD: '1' },
  { FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: 'com.campfirium.foliole.android.acceptance' },
  { FOLIOLE_ANDROID_COMPANION_SYNC_PORT: '38644' }
])('rejects personal preview and acceptance configuration before any build: %j', (env) => {
  const subject = fixture();
  const result = subject.run('build:android', [], env);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('ordinary offline app');
  expect(subject.calls()).toEqual([]);
});
