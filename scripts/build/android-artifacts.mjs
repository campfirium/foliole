import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function runCommand(command, args, options) {
  const result = spawnSync(command, args, {
    ...options, shell: process.platform === 'win32', stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

export function buildAndroidArtifacts({
  root, env = process.env, includeTests = false, useBuildCache = false,
  cap, gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  apk = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'),
  androidTestApk = path.join(root, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'),
  onStage = () => {}, run = runCommand
}) {
  onStage('web-build');
  run('npm', ['run', 'android:web:build'], { cwd: root, env });
  onStage('capacitor-sync');
  run(cap ?? 'npx', [...(cap ? [] : ['cap']), 'sync', 'android'], { cwd: root, env });
  onStage('gradle-build');
  run(gradle, ['--no-daemon', ...(useBuildCache ? ['--build-cache'] : []), 'assembleDebug',
    ...(includeTests ? ['assembleDebugAndroidTest'] : [])], { cwd: path.join(root, 'android'), env });
  onStage('apk-check');
  if (!existsSync(apk)) throw new Error(`Debug APK was not produced: ${apk}`);
  if (includeTests && !existsSync(androidTestApk)) {
    throw new Error(`Android test APK was not produced: ${androidTestApk}`);
  }
  return { apk, ...(includeTests ? { androidTestApk } : {}) };
}
