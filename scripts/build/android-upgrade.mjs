/* global console, process */

import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_ID = 'com.campfirium.foliole.android';
const ACTIVITY = `${APP_ID}/com.foliole.android.MainActivity`;
const USAGE = 'Usage: npm run upgrade:android -- --device <serial> --apk <file.apk> '
  + '[--adb <executable>] [--aapt2 <executable>]';

export function parseAndroidUpgradeArgs(args) {
  const options = { adb: 'adb', aapt2: 'aapt2' };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.slice(2);
    const value = args[index + 1];
    if (!args[index]?.startsWith('--') || !['device', 'apk', 'adb', 'aapt2'].includes(name)
      || seen.has(name) || !value || value.startsWith('-') || /[\0\r\n]/u.test(value)) {
      throw new Error(USAGE);
    }
    seen.add(name);
    options[name] = value;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(options.device ?? '') || !options.apk) {
    throw new Error(USAGE);
  }
  options.apk = path.resolve(options.apk);
  if (!statSync(options.apk).isFile()) throw new Error('APK must be a regular file.');
  return options;
}

function checked(command, args, stage, timeout = 30_000) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, timeout });
  if (result.error) throw new Error(`${stage}: ${result.error.message}`);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (result.status !== 0) throw new Error(`${stage}: ${output || `exit ${result.status}`}`);
  return output;
}

export function upgradeAndroid(options) {
  const { aapt2, adb, apk, device } = options;
  const manifest = checked(aapt2, ['dump', 'badging', apk], 'inspect-apk');
  if (manifest.match(/^package: name='([^']+)'/mu)?.[1] !== APP_ID) {
    throw new Error(`inspect-apk: expected the ordinary ${APP_ID} package.`);
  }
  const target = ['-s', device];
  if (checked(adb, [...target, 'get-state'], 'device-ready') !== 'device') {
    throw new Error('device-ready: the selected device is not ready.');
  }
  const user = checked(adb, [...target, 'shell', 'am', 'get-current-user'], 'android-user');
  if (!/^\d+$/u.test(user)) throw new Error('android-user: could not resolve the foreground user.');
  const installed = checked(adb, [...target, 'shell', 'pm', 'path', '--user', user, APP_ID], 'existing-app');
  if (!/^package:\S+/mu.test(installed)) {
    throw new Error('existing-app: ordinary Foliole is not installed for the foreground Android user.');
  }
  const result = checked(adb, [...target, 'install', '-r', '--user', user, apk], 'install', 180_000);
  if (!/^Success\s*$/mu.test(result)) throw new Error(`install: ${result}`);
  console.log(`ANDROID_APP_INSTALLED device=${device} user=${user} data-policy=keep`);
  const launch = checked(adb, [...target, 'shell', 'am', 'start', '-W', '--user', user,
    '-n', ACTIVITY], 'launch (app already installed)');
  const launchedActivity = launch.match(/^Activity:\s*(\S+)\s*$/mu)?.[1];
  if (!/^Status:\s*ok\s*$/mu.test(launch) || launchedActivity !== ACTIVITY
    || /(?:^|\n)(?:Error|Exception)/u.test(launch)) {
    throw new Error(`launch (app already installed): ${launch}`);
  }
  console.log(`ANDROID_APP_LAUNCHED device=${device} user=${user}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { upgradeAndroid(parseAndroidUpgradeArgs(process.argv.slice(2))); }
  catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
