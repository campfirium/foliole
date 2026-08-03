#!/usr/bin/env node
/* global console, process */

import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { linuxAppImageName, verifyLinuxArtifactDirectory } from './linux-release-contract.mjs';

const EVIDENCE_DIRECTORY = path.resolve('.tmp/artifacts/linux-appimage-acceptance');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: options.env ?? process.env,
    shell: false,
    stdio: options.capture ? 'pipe' : 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
  return result.stdout?.trim() ?? '';
}

export function assertLinuxAcceptanceEnvironment(env = process.env) {
  for (const name of [
    'APPIMAGE_EXTRACT_AND_RUN',
    'ELECTRON_DISABLE_SANDBOX',
    'FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG'
  ]) {
    if (env[name]) throw new Error(`${name} must not be set for Linux AppImage acceptance`);
  }
}

export async function acceptLinuxAppImage({ directory, targetSha, version }) {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('Linux AppImage acceptance requires a Linux x64 host');
  }
  assertLinuxAcceptanceEnvironment();
  const packageResult = await verifyLinuxArtifactDirectory(directory, version);
  const appImage = path.resolve(directory, linuxAppImageName(version));
  await chmod(appImage, 0o755);
  run('unshare', ['--user', 'true']);
  const headSha = run('git', ['rev-parse', 'HEAD'], { capture: true });
  if (headSha !== targetSha) throw new Error('Linux acceptance SHA does not match the checked out target');
  const env = {
    ...process.env,
    FOLIOLE_DESKTOP_ACCEPTANCE_EVIDENCE: '1',
    FOLIOLE_ELECTRON_APP_ROOT: process.cwd(),
    FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: appImage,
    FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
    FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
    FOLIOLE_LINUX_EXPECTED_VERSION: version
  };
  run(process.execPath, [
    'scripts/with-resource-gate.mjs', 'preview', '--',
    'xvfb-run', '--auto-servernum', process.execPath, 'node_modules/playwright/cli.js',
    'test', '--config', 'playwright.desktop.config.ts',
    'tests/desktop/linux-appimage-core.spec.ts',
    'tests/desktop/rc-golden-journey.spec.ts'
  ], { env });
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  const evidence = {
    appImage: packageResult.appImage,
    architecture: process.arch,
    checksum: packageResult.checksum,
    platform: process.platform,
    sha: targetSha,
    version
  };
  await writeFile(path.join(EVIDENCE_DIRECTORY, 'result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const readArg = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  acceptLinuxAppImage({
    directory: readArg('directory'),
    targetSha: readArg('target-sha'),
    version: readArg('version')
  }).then((evidence) => {
    console.log(`[linux-appimage-acceptance] status=PASSED sha=${evidence.sha} version=${evidence.version}`);
  }).catch((error) => {
    console.error(`[linux-appimage-acceptance] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
