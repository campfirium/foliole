/* global console, process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAndroidArtifacts } from './android-artifacts.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

export function buildAndroid({ root = ROOT, env = process.env } = {}) {
  if (env.FOLIOLE_DEV_LIVE_RELOAD === '1'
    || env.FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID
    || (env.FOLIOLE_ANDROID_COMPANION_SYNC_PORT && env.FOLIOLE_ANDROID_COMPANION_SYNC_PORT !== '38641')) {
    throw new Error('Public Android builds require the ordinary offline app configuration.');
  }
  buildAndroidArtifacts({ root, env });
  console.log('ANDROID_DEBUG_APK_READY android/app/build/outputs/apk/debug/app-debug.apk');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { buildAndroid(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
