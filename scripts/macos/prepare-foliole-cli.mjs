/* global console, process */

import { spawnSync } from 'node:child_process';
import { chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import postject from 'postject';

import { prepareNodeSeaRuntime } from './node-sea-runtime.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE = path.join(ROOT, 'scripts/macos/foliole-cli-launcher');
const OUTPUT = path.join(ROOT, '.tmp/macos/foliole-cli');
const XCODE_OUTPUT = path.join(OUTPUT, 'xcode');
const APP_OUTPUT = path.join(OUTPUT, 'Foliole CLI.app');
const RUNTIME_NAME = 'foliole-runtime';
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const DISTRIBUTION_PROFILE = 'Foliole CLI Mac App Store Connect 2026';
const DISTRIBUTION_IDENTITY = '5553A5CFFB332536BD7448CD4284CE3BFEA5D666';
const DEVELOPMENT_PROFILE = 'Foliole CLI macOS App Development 2026';
const DEVELOPMENT_IDENTITY = '31F64F511536B982DB6E0B17485724D9E3EC3D1C';

function runChecked(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

export function buildSeaConfig(blobPath) {
  return {
    disableExperimentalSEAWarning: true,
    main: path.join(SOURCE, 'bootstrap.cjs'),
    output: blobPath,
    useCodeCache: false,
    useSnapshot: false
  };
}

async function prepareSeaRuntime(nodePath) {
  const blobPath = path.join(OUTPUT, 'foliole-cli.blob');
  const configPath = path.join(OUTPUT, 'sea-config.json');
  const runtimePath = path.join(OUTPUT, RUNTIME_NAME);
  await writeFile(configPath, `${JSON.stringify(buildSeaConfig(blobPath), null, 2)}\n`);
  runChecked('SEA blob', nodePath, ['--experimental-sea-config', configPath]);
  await copyFile(nodePath, runtimePath);
  await chmod(runtimePath, 0o755);
  runChecked('remove Node signature', 'codesign', ['--remove-signature', runtimePath]);
  await postject.inject(runtimePath, 'NODE_SEA_BLOB', await readFile(blobPath), {
    machoSegmentName: 'NODE_SEA',
    sentinelFuse: SEA_FUSE
  });
  return runtimePath;
}

function launcherSigningArgs(mode) {
  if (mode === 'distribution') {
    return [
      'CODE_SIGN_STYLE=Manual',
      `CODE_SIGN_IDENTITY=${DISTRIBUTION_IDENTITY}`,
      `PROVISIONING_PROFILE_SPECIFIER=${DISTRIBUTION_PROFILE}`
    ];
  }
  return [
    'CODE_SIGN_STYLE=Manual',
    `CODE_SIGN_IDENTITY=${DEVELOPMENT_IDENTITY}`,
    `PROVISIONING_PROFILE_SPECIFIER=${DEVELOPMENT_PROFILE}`
  ];
}

function buildLauncher(mode) {
  runChecked('CLI Xcode project', process.execPath, [
    path.join(ROOT, 'node_modules/node-gyp/bin/node-gyp.js'),
    'configure',
    '--directory',
    SOURCE,
    '--',
    '-f',
    'xcode'
  ]);
  runChecked('CLI launcher', 'xcodebuild', [
    '-project',
    path.join(SOURCE, 'build/binding.xcodeproj'),
    '-scheme',
    'foliole_cli_launcher',
    '-configuration',
    'Release',
    '-destination',
    'platform=macOS,arch=arm64',
    '-derivedDataPath',
    XCODE_OUTPUT,
    'DEVELOPMENT_TEAM=V589TQH334',
    ...launcherSigningArgs(mode),
    'clean',
    'build'
  ]);
  return path.join(XCODE_OUTPUT, 'Build/Products/Release/foliole.app');
}

async function assembleAndSign(runtimePath, launcherPath, identity) {
  await cp(launcherPath, APP_OUTPUT, { recursive: true });
  const resources = path.join(APP_OUTPUT, 'Contents/Resources');
  await mkdir(resources, { recursive: true });
  await cp(path.join(ROOT, 'scripts/agent-control'), path.join(resources, 'scripts/agent-control'), {
    recursive: true
  });
  await copyFile(path.join(ROOT, 'package.json'), path.join(resources, 'package.json'));
  const bundledRuntime = path.join(APP_OUTPUT, 'Contents/MacOS', RUNTIME_NAME);
  await copyFile(runtimePath, bundledRuntime);
  await chmod(bundledRuntime, 0o755);
  runChecked('CLI runtime signature', 'codesign', [
    '--force', '--sign', identity, '--timestamp=none',
    '--entitlements', path.join(SOURCE, 'FolioleCliRuntime.entitlements'), bundledRuntime
  ]);
  runChecked('CLI wrapper signature', 'codesign', [
    '--force', '--sign', identity, '--timestamp=none',
    '--entitlements', path.join(SOURCE, 'FolioleCli.entitlements'), APP_OUTPUT
  ]);
  runChecked('CLI signature verification', 'codesign', ['--verify', '--deep', '--strict', APP_OUTPUT]);
}

export async function prepareFolioleCli(options = {}) {
  const mode = options.mode === 'distribution' ? 'distribution' : 'development';
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Foliole CLI packaging requires an arm64 Mac');
  }
  await rm(OUTPUT, { force: true, recursive: true });
  await mkdir(OUTPUT, { recursive: true });
  const nodePath = await prepareNodeSeaRuntime(ROOT, {
    run: (command, args) => runChecked('Node SEA runtime extraction', command, args)
  });
  const runtimePath = await prepareSeaRuntime(nodePath);
  const launcherPath = buildLauncher(mode);
  const identity = mode === 'distribution' ? DISTRIBUTION_IDENTITY : DEVELOPMENT_IDENTITY;
  await assembleAndSign(runtimePath, launcherPath, identity);
  return APP_OUTPUT;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  prepareFolioleCli().then((appPath) => {
    console.log(`[foliole-cli] status: PREPARED path=${appPath}`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
