#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { linuxAppImageName, verifyLinuxPackageDirectory } from './linux-deb-contract.mjs';

const EVIDENCE_DIRECTORY = path.resolve('.tmp/artifacts/linux-appimage-test');
const FAILURE_MESSAGE = 'Foliole requires the Electron sandbox.';

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8', shell: false, timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'], ...options
  });
}

function requireSuccess(result, label) {
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${label} failed: ${result.error?.message ?? result.stderr ?? result.signal}`);
  }
  return result.stdout.trim();
}

async function installDialogObserver() {
  const directory = path.join(EVIDENCE_DIRECTORY, 'bin');
  await mkdir(directory, { recursive: true });
  const zenity = path.join(directory, 'zenity');
  await writeFile(zenity, '#!/bin/sh\nprintf shown > "$FOLIOLE_APPIMAGE_DIALOG_MARKER"\n');
  await chmod(zenity, 0o755);
  return directory;
}

function testAppImageLaunch(appImage, observerDirectory, label, args) {
  const dialogMarker = path.join(EVIDENCE_DIRECTORY, `${label}-dialog`);
  const userData = path.join(EVIDENCE_DIRECTORY, `${label}-userdata`);
  const result = execute(appImage, ['--appimage-extract-and-run', ...args], {
    cwd: EVIDENCE_DIRECTORY,
    env: {
      ...process.env,
      APPIMAGE_EXTRACT_AND_RUN: '1',
      FOLIOLE_APPIMAGE_DIALOG_MARKER: dialogMarker,
      PATH: `${observerDirectory}:${process.env.PATH}`,
      XDG_CONFIG_HOME: userData
    }
  });
  if (result.error || result.signal || result.status !== 1
    || !result.stderr.includes(FAILURE_MESSAGE) || !existsSync(dialogMarker)
    || existsSync(userData)) {
    throw new Error(`${label} did not fail closed: status=${result.status} stderr=${result.stderr}`);
  }
  return { case: label, dialogShown: true, electronUserDataCreated: false, exitCode: result.status };
}

export async function testLinuxAppImage({ directory, targetSha, version }) {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('AppImage VM test requires a Linux x64 host');
  }
  await verifyLinuxPackageDirectory(directory, version);
  const actualSha = requireSuccess(execute('git', ['rev-parse', 'HEAD']), 'Git identity');
  if (actualSha !== targetSha) throw new Error('AppImage VM test SHA does not match checked out target');
  const namespaceProbe = execute('unshare', ['-Ur', 'true']);
  if (namespaceProbe.error || namespaceProbe.signal || namespaceProbe.status === 0) {
    throw new Error('Linux VM does not reproduce unavailable user namespaces');
  }
  const appImage = path.resolve(directory, linuxAppImageName(version));
  await rm(EVIDENCE_DIRECTORY, { force: true, recursive: true });
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  const observerDirectory = await installDialogObserver();
  const cases = [
    testAppImageLaunch(appImage, observerDirectory, 'unavailable-sandbox', []),
    testAppImageLaunch(appImage, observerDirectory, 'disabled-sandbox', ['--no-sandbox'])
  ];
  const evidence = {
    architecture: 'x64', cases,
    kernel: requireSuccess(execute('uname', ['-r']), 'Kernel identity'),
    namespaceProbeExitCode: namespaceProbe.status, sha: targetSha, version
  };
  await writeFile(path.join(EVIDENCE_DIRECTORY, 'result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  testLinuxAppImage({ directory: arg('directory'), targetSha: arg('target-sha'), version: arg('version') })
    .then(() => console.log('[linux-appimage-test] status=PASSED'))
    .catch((error) => {
      console.error(`[linux-appimage-test] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
