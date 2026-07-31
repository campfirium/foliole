/* global console, process */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runInherited } from './android-host-process.mjs';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function runSync(env, runner) {
  let code = await runner('npm', ['run', 'android:web:build'], { cwd: REPO_ROOT, env });
  if (code !== 0) return code;
  const capCli = path.join(REPO_ROOT, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
  code = await runner(process.execPath, [capCli, 'sync', 'android'], { cwd: REPO_ROOT, env });
  if (code === 0) console.log('[android-cap-sync] status: SYNCED');
  return code;
}

function runGradle(args, env, runner) {
  if (args.length === 0) {
    console.error('[android-gradle-check] missing Gradle task.');
    return 2;
  }
  return runner('./gradlew', ['--no-daemon', ...args], {
    cwd: path.join(REPO_ROOT, 'android'),
    env
  });
}

export function runNativeLinuxAndroidHost(command, args, options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? runInherited;
  if (platform !== 'linux') {
    console.error('[native-linux-host] hosted Android checks require Linux.');
    return 2;
  }
  if (command === 'sync' && args.length === 0) return runSync(env, runner);
  if (command === 'gradle' && args.length === 1 && ['lint', 'testDebugUnitTest'].includes(args[0])) {
    return runGradle(args, env, runner);
  }
  console.error(`[native-linux-host] unsupported command: ${command || '<missing>'}`);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assertQualityCommandAllowed('runner:android-host-quality');
  const [command = '', ...args] = process.argv.slice(2);
  process.exitCode = await runNativeLinuxAndroidHost(command, args);
}
