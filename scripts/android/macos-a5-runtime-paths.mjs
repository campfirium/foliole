/* global process */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { createMacosA5ExecutionContext } from './macos-a5-execution-context.mjs';

const SDK_ROOT = '/opt/homebrew/share/android-commandlinetools';
const JAVA_HOME = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';

export function macosA5Paths(contextOrRepoRoot) {
  const context = typeof contextOrRepoRoot === 'string'
    ? createMacosA5ExecutionContext({ action: 'legacy-helper', repoRoot: contextOrRepoRoot })
    : contextOrRepoRoot;
  return {
    adb: path.join(SDK_ROOT, 'platform-tools', 'adb'),
    ...context,
    apk: path.join(context.buildRoot, 'android/app/build/outputs/apk/debug/app-debug.apk'),
    cap: path.join(context.buildRoot, 'node_modules/.bin/cap'),
    electron: path.join(context.buildRoot,
      'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    electronPackage: path.join(context.buildRoot, 'node_modules/electron/package.json'),
    gradle: path.join(context.buildRoot, 'android/gradlew'),
    java: path.join(JAVA_HOME, 'bin/java')
  };
}

export function macosA5GradleEnv(env = process.env) {
  return { ...env, ANDROID_HOME: SDK_ROOT, ANDROID_SDK_ROOT: SDK_ROOT, JAVA_HOME };
}

export function assertSafeMacosA5Environment(paths) {
  if (process.platform !== 'darwin') throw new Error('macos-a5-dev only runs on macOS');
  for (const key of ['adb', 'cap', 'gradle', 'java']) {
    if (!existsSync(paths[key])) throw new Error(`Missing required ${key}: ${paths[key]}`);
  }
}
