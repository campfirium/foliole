import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TOOL = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_TRACE, JSON.stringify({ tool, args, cwd: process.cwd() }) + '\\n');
const config = JSON.parse(process.env.FAKE_CONFIG || '{}');
if (config.fail === tool) { console.error('fixture build failed'); process.exit(1); }
if (tool === 'aapt2') console.log("package: name='" + (config.package || 'com.campfirium.foliole.android') + "' versionCode='1'");
if (tool === 'adb') {
  const command = args.slice(2);
  if (command[0] === 'get-state') console.log(config.state || 'device');
  else if (command.join(' ') === 'shell am get-current-user') console.log(config.user || '10');
  else if (command[1] === 'pm') {
    const installed = config.installedPackages?.includes(command.at(-1)) ?? !config.absent;
    if (installed) console.log('package:/data/app/ordinary/base.apk');
  }
  else if (command[0] === 'install') {
    if (config.installFailure) { console.error('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]'); process.exit(1); }
    console.log(config.installOutput || 'Success');
  } else if (command[1] === 'am' && command[2] === 'start') {
    console.log(config.launchOutput || (config.launchFailure ? 'Error: Activity not started' :
      'Status: ok\\nActivity: com.campfirium.foliole.android/com.foliole.android.MainActivity'));
  } else { console.error('unexpected device command'); process.exit(2); }
}
`;

export function androidCliFixture(config = {}) {
  const parent = path.join(ROOT, '.tmp/artifacts/T704');
  mkdirSync(parent, { recursive: true });
  const root = realpathSync(mkdtempSync(path.join(parent, 'public cli ')));
  const scripts = path.join(root, 'scripts/build');
  const bin = path.join(root, 'tools with spaces');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(bin);
  mkdirSync(path.join(root, 'android'));
  for (const directory of [bin, path.join(root, 'android')]) {
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ type: 'commonjs' }));
  }
  for (const file of ['android.mjs', 'android-upgrade.mjs']) {
    copyFileSync(path.join(ROOT, 'scripts/build', file), path.join(scripts, file));
  }
  for (const name of ['adb', 'aapt2', 'npm', 'npx']) {
    writeFileSync(path.join(bin, name), TOOL, { mode: 0o755 });
  }
  writeFileSync(path.join(root, 'android/gradlew'), TOOL, { mode: 0o755 });
  const { scripts: registered } = JSON.parse(readFileSync(path.join(ROOT, 'package.json')));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: {
    'build:android': registered['build:android'], 'upgrade:android': registered['upgrade:android']
  } }));
  const apk = path.join(root, 'fresh app.apk');
  writeFileSync(apk, 'fixture-apk');
  const trace = path.join(root, 'trace.jsonl');
  return {
    root, apk,
    calls: () => {
      try { return readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    },
    run(script = 'upgrade:android', args = ['--device', 'user-phone:5555', '--apk', apk], overrides = {}) {
      const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        FAKE_TRACE: trace, FAKE_CONFIG: JSON.stringify(config) };
      for (const key of ['FOLIOLE_DEV_LIVE_RELOAD', 'FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID',
        'FOLIOLE_ANDROID_COMPANION_SYNC_PORT']) delete env[key];
      return spawnSync(process.execPath, [process.env.npm_execpath, 'run', script, '--', ...args], {
        cwd: root, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 20_000
      });
    }
  };
}
