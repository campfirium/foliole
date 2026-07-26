// @vitest-environment node
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { androidSdkCandidates, resolveAndroidTool, resolveExecutable, withAndroidSdk, withJavaHome } from './android-tools.mjs';

describe('macOS Android tool resolution', () => {
  it('prefers explicit SDK roots before the official macOS default', () => {
    expect(androidSdkCandidates({ ANDROID_HOME: '/sdk/home', ANDROID_SDK_ROOT: '/sdk/legacy' }, '/Users/test')).toEqual([
      '/sdk/home',
      '/sdk/legacy',
      '/Users/test/Library/Android/sdk',
      '/opt/homebrew/share/android-commandlinetools',
      '/usr/local/share/android-commandlinetools'
    ]);
  });

  it('requires executable candidates and resolves PATH without shell lookup', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'android-tools-'));
    try {
      const bin = path.join(root, 'bin');
      await mkdir(bin);
      const adb = path.join(bin, 'adb');
      await writeFile(adb, '#!/bin/sh\nexit 0\n');
      expect(resolveExecutable('adb', [], bin)).toBeNull();
      await chmod(adb, 0o755);
      expect(resolveExecutable('adb', [], bin)).toBe(adb);
      expect(resolveAndroidTool('adb', { env: { ADB_PATH: adb, PATH: '' }, home: root })).toBe(adb);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('injects an executable explicit Java home into the host environment', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'android-java-'));
    try {
      const bin = path.join(root, 'bin');
      await mkdir(bin);
      await writeFile(path.join(bin, 'java'), '#!/bin/sh\nexit 0\n');
      await chmod(path.join(bin, 'java'), 0o755);
      expect(withJavaHome({ JAVA_HOME: root, PATH: '/usr/bin' })).toMatchObject({ JAVA_HOME: root });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('injects an SDK root that contains installed platforms', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'android-sdk-'));
    try {
      await mkdir(path.join(root, 'platforms'));
      expect(withAndroidSdk({ ANDROID_HOME: root })).toMatchObject({ ANDROID_HOME: root });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
