/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  createSyncGroupDeviceIdentity,
  isSameSyncGroupDevice
} from '../../lib/platform/syncGroupUnifiedContract.ts';

const MARKER = 'FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE';
const GROUP_ID = 'group-t152-device-anchor-acceptance';
const OTHER_ANCHOR = '22222222-2222-4222-8222-222222222222';
const ROOT = path.resolve(import.meta.dirname, '../..');
const ARTIFACT_ROOT = path.join(ROOT, '.tmp/artifacts/device-anchor/t152-1');

export function verifyDesktopDeviceAnchorAcceptance(development, packaged) {
  if (development?.status !== 'passed' || packaged?.status !== 'passed') {
    throw new Error(development?.error || packaged?.error || 'desktop device anchor acceptance failed');
  }
  if (development.anchor_file !== packaged.anchor_file ||
      !isSameSyncGroupDevice(development.identity, packaged.identity)) {
    throw new Error('DEV and packaged macOS did not resolve one Device');
  }
  const moved = createSyncGroupDeviceIdentity({
    device_anchor: development.identity.device_anchor,
    group_id: GROUP_ID,
    library_path: `${development.identity.canonical_library_path}.copy`,
    path_flavor: 'posix'
  });
  const otherDevice = createSyncGroupDeviceIdentity({
    device_anchor: OTHER_ANCHOR,
    group_id: GROUP_ID,
    library_path: development.identity.canonical_library_path,
    path_flavor: 'posix'
  });
  if (isSameSyncGroupDevice(development.identity, moved) ||
      isSameSyncGroupDevice(development.identity, otherDevice)) {
    throw new Error('Device composite identity did not separate path or OS user/device');
  }
  return { moved_identity_key: moved.identity_key, other_device_identity_key: otherDevice.identity_key };
}

export function parseAcceptanceOutput(output) {
  const line = output.split(/\r?\n/u).find((value) => value.startsWith(`${MARKER} `));
  if (!line) throw new Error(`Desktop device anchor acceptance marker missing:\n${output}`);
  return JSON.parse(line.slice(MARKER.length + 1));
}

export function resolvePackagedZip(repoRoot = ROOT) {
  const metadata = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  return path.join(repoRoot, 'artifacts/macos/github-arm64',
    `Foliole-macOS-arm64-${metadata.version}.zip`);
}

export function resolvePackagedChannel(channel = 'github') {
  if (!['github', 'mas'].includes(channel)) {
    throw new Error(`Unsupported signed macOS package channel: ${channel}`);
  }
  return channel;
}

export function runDesktopDeviceAnchorAcceptance(options = {}) {
  const repoRoot = options.repoRoot ?? ROOT;
  const artifactRoot = options.artifactRoot ?? ARTIFACT_ROOT;
  const revision = assertFrozenRevision(repoRoot, options.runCapture ?? capture);
  const packageZip = options.packageZip ?? resolvePackagedZip(repoRoot);
  const packagedChannel = resolvePackagedChannel(options.packagedChannel);
  if (!fs.existsSync(packageZip)) throw new Error(`Signed macOS package is missing: ${packageZip}`);
  fs.rmSync(artifactRoot, { force: true, recursive: true });
  const packageRoot = path.join(artifactRoot, 'packaged');
  const libraryPath = path.join(artifactRoot, 'library/Data/foliole.db');
  fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
  fs.writeFileSync(libraryPath, 'T152 device identity acceptance fixture\n', { flag: 'wx' });
  run(repoRoot, '/usr/bin/ditto', ['-x', '-k', packageZip, packageRoot]);
  const appPath = path.join(packageRoot, 'Foliole.app');
  run(repoRoot, 'codesign', ['--verify', '--deep', '--strict', appPath]);
  const commonEnv = {
    ...process.env,
    FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE_GROUP_ID: GROUP_ID,
    FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE_LIBRARY_PATH: libraryPath,
    FOLIOLE_PREVIEW_SANDBOX: '1',
    FOLIOLE_PREVIEW_SANDBOX_RESET: '0'
  };
  const development = launchAcceptance(repoRoot,
    path.join(repoRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    [path.join(repoRoot, 'dist/electron/main.js')], commonEnv, 'development');
  const packaged = launchAcceptance(repoRoot,
    path.join(appPath, 'Contents/MacOS/Foliole'), [], commonEnv, packagedChannel);
  const separation = verifyDesktopDeviceAnchorAcceptance(development, packaged);
  const receipt = {
    accepted_tip: revision,
    development,
    package_zip: packageZip,
    packaged_channel: packagedChannel,
    packaged,
    separation,
    status: 'passed'
  };
  fs.writeFileSync(path.join(artifactRoot, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

function launchAcceptance(repoRoot, command, args, env, channel) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...env, [MARKER]: channel },
    timeout: 120_000
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const receipt = parseAcceptanceOutput(output);
  if (result.status !== 0 || receipt.status !== 'passed') {
    throw new Error(receipt.error || `${channel} device anchor acceptance failed with ${result.status}`);
  }
  return receipt;
}

function assertFrozenRevision(repoRoot, execute) {
  if (execute(repoRoot, 'git', ['status', '--porcelain', '--untracked-files=no']).trim()) {
    throw new Error('Desktop device anchor acceptance requires a clean tracked worktree.');
  }
  const revision = execute(repoRoot, 'git', ['rev-parse', 'HEAD']).trim();
  const remote = execute(repoRoot, 'git', ['rev-parse', 'origin/dev']).trim();
  if (!revision || revision !== remote) {
    throw new Error('Desktop device anchor acceptance requires HEAD == origin/dev.');
  }
  return revision;
}

function capture(repoRoot, command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed with ${result.status}`);
  return result.stdout;
}

function run(repoRoot, command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', timeout: 600_000 });
  if (result.status !== 0) throw new Error(`${command} failed with ${result.status}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    runDesktopDeviceAnchorAcceptance({
      packageZip: readOption(process.argv, '--package-zip'),
      packagedChannel: readOption(process.argv, '--packaged-channel')
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function readOption(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1]?.trim();
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}
