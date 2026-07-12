/* global console, process */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runInherited, spawnDetached } from '../../android/android-host-process.mjs';
import { runControl, runLogcat, runScreenshot } from './android-device-actions.mjs';
import { runMacPreview } from './android-preview.mjs';
import { requireTool, resolveAndroidTool, withAndroidSdk, withJavaHome } from './android-tools.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function runSync(env) {
  let code = await runInherited('npm', ['run', 'android:web:build'], { cwd: REPO_ROOT, env });
  if (code !== 0) return code;
  const capCli = path.join(REPO_ROOT, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
  code = await runInherited(process.execPath, [capCli, 'sync', 'android'], { cwd: REPO_ROOT, env });
  if (code === 0) console.log('[android-cap-sync] status: SYNCED');
  return code;
}

async function runGradle(args, env) {
  if (args.length === 0) {
    console.error('[android-gradle-check] missing Gradle task.');
    return 2;
  }
  return runInherited('./gradlew', args, { cwd: path.join(REPO_ROOT, 'android'), env });
}

async function runEmulator(args, env) {
  const avd = args[0] ?? env.FOLIOLE_ANDROID_AVD ?? '';
  if (!avd) throw new Error('Android AVD name is required. Pass it explicitly or set FOLIOLE_ANDROID_AVD.');
  const emulator = requireTool(resolveAndroidTool('emulator', { env }), 'Android emulator not found. Install it or set ANDROID_EMULATOR_PATH/ANDROID_HOME.');
  const child = spawnDetached(emulator, ['-avd', avd, '-timezone', env.ANDROID_EMULATOR_TIMEZONE ?? env.TZ ?? 'Asia/Shanghai']);
  console.log(`[android-emulator] pid: ${child.pid}`);
  console.log('[android-emulator] status: OPENED');
  return 0;
}

export async function runMacosAndroidHost(command, args, env = process.env) {
  const hostEnv = withAndroidSdk(withJavaHome(env));
  switch (command) {
    case 'control': return runControl(args, hostEnv);
    case 'emulator': return runEmulator(args, hostEnv);
    case 'gradle': return runGradle(args, hostEnv);
    case 'logcat': return runLogcat(args, hostEnv);
    case 'open': return runInherited('open', ['-a', 'Android Studio', path.join(REPO_ROOT, 'android')], { env: hostEnv });
    case 'preview': return runMacPreview(REPO_ROOT, runSync, hostEnv);
    case 'preview-lite': return runMacPreview(REPO_ROOT, runSync, { ...hostEnv, ANDROID_DATA_PROTECTION: hostEnv.ANDROID_DATA_PROTECTION ?? '0' });
    case 'screenshot': return runScreenshot(args, hostEnv);
    case 'sync': return runSync(hostEnv);
    default:
      console.error(`[android-host] unsupported macOS command: ${command || '<missing>'}`);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command = '', ...args] = process.argv.slice(2);
  try {
    process.exitCode = await runMacosAndroidHost(command, args);
  } catch (error) {
    console.error(`[android-host] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
