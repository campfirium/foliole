import { rmSync } from 'node:fs';
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

it('upgrades only the explicit device and foreground user, then reports launch separately', () => {
  const subject = fixture();
  const result = subject.run();
  expect(result.status, result.stderr).toBe(0);
  const calls = subject.calls();
  const adb = calls.filter(({ tool }) => tool === 'adb');
  expect(adb.map(({ args }) => args)).toEqual([
    ['-s', 'user-phone:5555', 'get-state'],
    ['-s', 'user-phone:5555', 'shell', 'am', 'get-current-user'],
    ['-s', 'user-phone:5555', 'shell', 'pm', 'path', '--user', '10', 'com.campfirium.foliole.android'],
    ['-s', 'user-phone:5555', 'install', '-r', '--user', '10', subject.apk],
    ['-s', 'user-phone:5555', 'shell', 'am', 'start', '-W', '--user', '10', '-n',
      'com.campfirium.foliole.android/com.foliole.android.MainActivity']
  ]);
  expect(result.stdout).toContain('ANDROID_APP_INSTALLED');
  expect(result.stdout).toContain('ANDROID_APP_LAUNCHED');
  expect(calls[0]).toMatchObject({ tool: 'aapt2', args: ['dump', 'badging', subject.apk] });
});

it.each([
  [], ['--apk', 'file.apk'], ['--device', 'phone'], ['--device', '-e', '--apk', 'file.apk'],
  ['--device', 'phone;clear', '--apk', 'file.apk'],
  ['--device', 'one', '--device', 'two', '--apk', 'file.apk'],
  ['--device', 'one', '--apk', 'file.apk', '--clear-data', 'yes']
])('rejects invalid or missing targets without invoking device tools: %j', (...args) => {
  const subject = fixture();
  const result = subject.run('upgrade:android', args);
  expect(result.status).not.toBe(0);
  expect(subject.calls()).toEqual([]);
});

it.each(['com.campfirium.foliole.android.acceptance', 'some.other.app'])('rejects APK identity %s', (packageId) => {
  const subject = fixture({ package: packageId });
  expect(subject.run().status).not.toBe(0);
  expect(subject.calls().map(({ tool }) => tool)).toEqual(['aapt2']);
});

it.each([
  { state: 'offline' }, { user: 'unknown' }, { absent: true },
  { installedPackages: ['com.campfirium.foliole.android.acceptance'] }
])('refuses an unavailable target or missing ordinary installation: %j', (config) => {
  const subject = fixture(config);
  const result = subject.run();
  expect(result.status).not.toBe(0);
  expect(subject.calls().some(({ args }) => args.includes('install'))).toBe(false);
  expect(result.stdout).not.toContain('ANDROID_APP_INSTALLED');
});

it.each([{ installFailure: true }, { installOutput: 'Failure [VERSION_DOWNGRADE]' }])(
  'stops at install failure without retries, backup, clear, uninstall or launch: %j', (config) => {
    const subject = fixture(config);
    const result = subject.run();
    expect(result.status).not.toBe(0);
    expect(subject.calls().map(({ args }) => args.slice(2, 5))).toEqual([
      [subject.apk], ['get-state'], ['shell', 'am', 'get-current-user'],
      ['shell', 'pm', 'path'], ['install', '-r', '--user']
    ]);
    expect(result.stdout).not.toContain('ANDROID_APP_INSTALLED');
  }
);

it.each([
  { launchFailure: true }, { launchOutput: 'Status: ok\nActivity: some.other.app/MainActivity' }
])('reports installation when the subsequent launch fails, without reinstalling: %j', (config) => {
  const subject = fixture(config);
  const result = subject.run();
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain('ANDROID_APP_INSTALLED');
  expect(result.stdout).not.toContain('ANDROID_APP_LAUNCHED');
  expect(result.stderr).toContain('app already installed');
  expect(subject.calls().filter(({ args }) => args.includes('install'))).toHaveLength(1);
  expect(subject.calls()).toHaveLength(6);
});

it.each(['missing.apk', '.'])('rejects a missing or non-file APK without device access: %s', (name) => {
  const subject = fixture();
  expect(subject.run('upgrade:android', ['--device', 'phone', '--apk', path.join(subject.root, name)]).status)
    .not.toBe(0);
  expect(subject.calls()).toEqual([]);
});

it('accepts explicit SDK tool paths and stops if the selected tool cannot be started', () => {
  const subject = fixture();
  const result = subject.run('upgrade:android', ['--device', 'phone', '--apk', subject.apk,
    '--aapt2', path.join(subject.root, 'missing tool')]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('inspect-apk');
  expect(subject.calls()).toEqual([]);
});
