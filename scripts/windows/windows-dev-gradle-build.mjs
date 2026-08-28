/* global process */

import path from 'node:path';

import { windowsDevFailure } from './windows-dev-build-support.mjs';

const COMMANDS = {
  build: 'call .\\gradlew.bat --no-daemon assembleDebugAndroidTest',
  'capture-annotation': 'call .\\gradlew.bat --no-daemon assembleDebug assembleDebugAndroidTest'
};

export async function runWindowsDevGradleBuild(execute, paths, platform, action) {
  let directChildPid = null;
  const build = await execute('cmd.exe', ['/d', '/s', '/c', COMMANDS[action]], {
    cwd: path.join(paths.repoRoot, 'android'),
    env: { ...process.env, ANDROID_HOME: paths.androidSdk, ANDROID_SDK_ROOT: paths.androidSdk,
      ANDROID_USER_HOME: paths.signingHome, JAVA_HOME: paths.javaHome },
    onSpawn: (child) => { directChildPid = child.pid; }, platform,
    timeoutCode: 'build_timeout', timeoutMs: 20 * 60_000, windowsHide: true
  });
  if (build.code !== 0 || !build.output.includes('BUILD SUCCESSFUL')) {
    throw Object.assign(windowsDevFailure('Gradle did not reach BUILD SUCCESSFUL', 74, 'build'), {
      result: build
    });
  }
  return { directChildPid, output: build.output };
}
