/* global console, process */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runInherited } from './android-host-process.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function runSync(env) {
  let code = await runInherited('npm', ['run', 'android:web:build'], { cwd: REPO_ROOT, env });
  if (code !== 0) return code;
  const capCli = path.join(REPO_ROOT, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
  code = await runInherited(process.execPath, [capCli, 'sync', 'android'], { cwd: REPO_ROOT, env });
  if (code === 0) console.log('[android-cap-sync] status: SYNCED');
  return code;
}

function runGradle(args, env) {
  if (args.length === 0) {
    console.error('[android-gradle-check] missing Gradle task.');
    return 2;
  }
  return runInherited('./gradlew', ['--no-daemon', ...args], {
    cwd: path.join(REPO_ROOT, 'android'),
    env
  });
}

export function runNativeLinuxAndroidHost(command, args, env = process.env) {
  if (command === 'sync') return runSync(env);
  if (command === 'gradle') return runGradle(args, env);
  console.error(`[android-host] unsupported native Linux command: ${command || '<missing>'}`);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command = '', ...args] = process.argv.slice(2);
  process.exitCode = await runNativeLinuxAndroidHost(command, args);
}
