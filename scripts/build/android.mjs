/* global console, process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, shell: process.platform === 'win32', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

export function buildAndroid({ root = ROOT, env = process.env } = {}) {
  if (env.FOLIOLE_DEV_LIVE_RELOAD === '1'
    || env.FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID
    || (env.FOLIOLE_ANDROID_COMPANION_SYNC_PORT && env.FOLIOLE_ANDROID_COMPANION_SYNC_PORT !== '38641')) {
    throw new Error('Public Android builds require the ordinary offline app configuration.');
  }
  run('npm', ['run', 'android:web:build'], root, env);
  run('npx', ['cap', 'sync', 'android'], root, env);
  run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
    ['--no-daemon', 'assembleDebug'], path.join(root, 'android'), env);
  console.log('ANDROID_DEBUG_APK_READY android/app/build/outputs/apk/debug/app-debug.apk');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { buildAndroid(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
