/* global console, process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, { cwd, shell: process.platform === 'win32', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

try {
  run('npm', ['run', 'android:web:build']);
  run('npx', ['cap', 'sync', 'android']);
  run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['--no-daemon', 'assembleDebug'], path.join(ROOT, 'android'));
  console.log('ANDROID_DEBUG_APK_READY android/app/build/outputs/apk/debug/app-debug.apk');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
