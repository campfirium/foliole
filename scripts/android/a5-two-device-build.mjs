import fs from 'node:fs';
import path from 'node:path';

import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';

export function buildA5TwoDeviceAcceptance(args) {
  const env = { ...macosAcceptanceEnv(args.env),
    FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: ACCEPTANCE_APP_ID };
  args.checked('npm', ['run', 'android:web:build'], { cwd: args.paths.buildRoot, env });
  args.checked(args.paths.cap, ['sync', 'android'], { cwd: args.paths.buildRoot, env });
  args.checked(args.paths.gradle, [
    '--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'
  ], { cwd: path.join(args.paths.buildRoot, 'android'), env });
  args.checked('npm', ['run', 'build'], { cwd: args.paths.buildRoot, env });
  args.checked('npm', ['run', 'electron:compile'], { cwd: args.paths.buildRoot, env });
  if (!fs.existsSync(args.paths.apk)) throw new Error('A5 acceptance APK was not produced.');
  return env;
}
