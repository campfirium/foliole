/* global console, process */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { prepareCodexHelper } from './prepare-codex-helper.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUTPUT_DIRECTORY = 'artifacts/macos/github-arm64';
const DEVELOPER_IDENTITY = 'CAMPFIRIUM LTD (V589TQH334)';

export function createGithubBuilderConfig(base, options) {
  const portableBase = { ...base };
  delete portableBase.electronDist;
  return {
    ...portableBase,
    appId: 'com.campfirium.foliole',
    directories: { ...base.directories, output: OUTPUT_DIRECTORY },
    extraFiles: [
      ...(base.extraFiles ?? []),
      { from: options.codexPath, to: 'MacOS/codex' }
    ],
    extraResources: [
      ...base.extraResources,
      { from: 'build/macos/codex-NOTICE.txt', to: 'codex/NOTICE.txt' },
      { from: 'LICENSE', to: 'codex/LICENSE' }
    ],
    mac: {
      ...base.mac,
      artifactName: '${productName}-${version}-mac-${arch}.${ext}',
      binaries: ['Contents/MacOS/codex'],
      entitlements: 'build/entitlements.mas.plist',
      entitlementsInherit: 'build/entitlements.mas.inherit.plist',
      forceCodeSigning: true,
      hardenedRuntime: true,
      identity: DEVELOPER_IDENTITY,
      notarize: options.notarize,
      preAutoEntitlements: false,
      sign: 'scripts/macos/sign-mas-app.mjs',
      target: ['dmg', 'zip']
    }
  };
}

export function hasNotarizationCredentials(env) {
  const hasAppleId = env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID;
  const hasApiKey = env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER;
  const hasKeychainProfile = env.APPLE_KEYCHAIN_PROFILE;
  return Boolean(hasAppleId || hasApiKey || hasKeychainProfile);
}

export function sendMacosNotification(title, message, run = spawnSync) {
  const script = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run';
  const result = run('osascript', ['-e', script, '--', title, message], { stdio: 'ignore' });
  return result.status === 0;
}

export async function writeDmgChecksum(outputDirectory) {
  const names = (await readdir(outputDirectory)).filter((name) => name.endsWith('.dmg'));
  if (names.length !== 1) throw new Error(`Expected one DMG in ${outputDirectory}; found ${names.length}`);
  const digest = createHash('sha256').update(await readFile(path.join(outputDirectory, names[0]))).digest('hex');
  await writeFile(path.join(outputDirectory, 'SHA256SUMS.txt'), `${digest}  ${names[0]}\n`);
  return { digest, name: names[0] };
}

function run(label, command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, env: process.env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('GitHub macOS packaging requires an arm64 Mac');
  }
  const notarize = process.argv.includes('--notarize');
  if (notarize && !hasNotarizationCredentials(process.env)) {
    throw new Error('Notarization credentials are unavailable; configure an approved notarytool authentication method');
  }
  const outputDirectory = path.join(ROOT, OUTPUT_DIRECTORY);
  const codexPath = await prepareCodexHelper();
  const base = JSON.parse(await readFile(path.join(ROOT, 'electron/builder.json'), 'utf8'));
  const config = createGithubBuilderConfig(base, { codexPath, notarize });
  const configPath = path.join(ROOT, '.tmp/electron-builder-github-macos.json');
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run('build', 'npm', ['run', 'build']);
  run('electron compile', 'npm', ['run', 'electron:compile']);
  run('electron-builder', 'npm', ['exec', '--', 'electron-builder', '--config', configPath, '--mac', '--arm64', '--publish', 'never']);
  const checksum = await writeDmgChecksum(outputDirectory);
  console.log(`DMG_READY ${checksum.name} ${checksum.digest}`);
  sendMacosNotification(
    'Foliole macOS release',
    notarize ? 'Apple notarization and DMG packaging completed.' : 'macOS DMG packaging completed.'
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    sendMacosNotification('Foliole macOS release', 'Notarization or DMG packaging failed. Check the terminal log.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
