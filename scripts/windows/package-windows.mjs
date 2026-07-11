#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBuiltArtifactsFresh } from './package-built-artifacts.mjs';
import {
  cleanReleaseArtifacts,
  collectArtifactSummary as collectPackageArtifactSummary,
  collectInstallerArtifactPaths,
  formatBytes,
  readPackageVersion as readPackageVersionFromArtifacts,
  resolveInstallerBaseName,
  resolvePackagedInstallerPath,
  resolveReleaseArtifactPaths
} from './package-windows-artifacts.mjs';
import {
  INTERNAL_OUTPUT_DIR,
  formatInternalBuildVersion,
  writeInternalBuilderConfig
} from './package-windows-internal-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const WINDOWS_REPO_ROOT = 'D:\\C\\foliole';
const WINDOWS_NODE_DIR = 'D:\\R\\nodejs';

export function resolvePackageMode(argv = process.argv, platform = process.platform) {
  return argv.includes('--native') || platform === 'win32' ? 'native' : 'wsl';
}

export function resolveInstallMode(argv = process.argv) {
  return argv.includes('--install') || process.env.npm_config_install === 'true';
}

export function resolveInternalMode(argv = process.argv) {
  return argv.includes('--internal');
}

export function resolveBuiltArtifactMode(argv = process.argv) {
  return argv.includes('--from-built');
}

export function resolvePackageStatusLabel(install) {
  return install ? 'PACKAGED_AND_INSTALLED' : 'PACKAGED';
}

export function createCurrentUserInstallArgs() {
  return ['/currentuser', '/S'];
}

function createCmdStep(label, command) {
  return {
    args: ['/d', '/s', '/c', command],
    command: 'cmd.exe',
    label
  };
}

export function createNativePackageSteps(fromBuilt = resolveBuiltArtifactMode(), internal = resolveInternalMode()) {
  const buildSteps = fromBuilt ? [] : [
    createCmdStep('renderer build', 'npm run build'),
    createCmdStep('electron compile', 'npm run electron:compile')
  ];
  const builderConfig = internal ? '.tmp/electron-builder-internal.json' : 'electron/builder.json';
  return [
    ...buildSteps,
    createCmdStep('electron-builder nsis', `npm exec -- electron-builder --config ${builderConfig} --win nsis --publish never`)
  ];
}

export function createWslPackageSteps(rootDir = repoRoot, install = resolveInstallMode(), fromBuilt = resolveBuiltArtifactMode(), internal = resolveInternalMode()) {
  const nativeArgs = [];
  if (fromBuilt) {
    nativeArgs.push('--from-built', '--skip-built-artifact-check');
  }
  if (install) {
    nativeArgs.push('--install');
  }
  if (internal) {
    nativeArgs.push('--internal');
  }
  const nativeArgText = nativeArgs.length > 0 ? ` -- ${nativeArgs.join(' ')}` : '';
  const preflightSteps = fromBuilt ? [{
    args: ['scripts/windows/package-built-artifacts.mjs'],
    command: 'node',
    cwd: rootDir,
    label: 'verify built artifacts'
  }] : [];
  return [
    ...preflightSteps,
    {
      args: ['scripts/windows/windows-sync.sh'],
      command: 'bash',
      cwd: rootDir,
      env: {
        WINDOWS_SYNC_FORCE_FULL: '1',
        WINDOWS_SYNC_INCLUDE_DIST: fromBuilt ? '1' : ''
      },
      label: 'sync Windows checkout'
    },
    {
      args: [
        '/d',
        '/s',
        '/c',
        `cd /d ${WINDOWS_REPO_ROOT} && set "PATH=${WINDOWS_NODE_DIR};%PATH%" && npm run windows:package:native${nativeArgText}`
      ],
      command: 'cmd.exe',
      cwd: '/mnt/c/Windows/System32',
      label: 'run Windows-native package'
    }
  ];
}

function mergeEnv(extraEnv) {
  return { ...process.env, ...(extraEnv ?? {}) };
}

function runStep(step) {
  console.log(`[windows-package] step: ${step.label}`);
  return new Promise((resolvePromise, reject) => {
    const defaultCwd = resolvePackageMode() === 'native' ? repoRoot : process.cwd();
    const child = spawn(step.command, step.args, {
      cwd: step.cwd ?? defaultCwd,
      env: mergeEnv(step.env),
      stdio: 'inherit'
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${step.label} failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

export {
  cleanReleaseArtifacts,
  collectInstallerArtifactPaths,
  formatBytes,
  resolvePackagedInstallerPath,
  resolveReleaseArtifactPaths
};

export function readPackageVersion(rootDir = repoRoot) {
  return readPackageVersionFromArtifacts(rootDir);
}

export function collectArtifactSummary(rootDir = process.cwd(), packageVersion = readPackageVersion(rootDir), outputDir = 'artifacts/windows') {
  return collectPackageArtifactSummary({
    collectInstallers: () => collectInstallerArtifactPaths(rootDir, packageVersion, outputDir),
    installerBaseName: resolveInstallerBaseName(packageVersion),
    outputDir,
    rootDir
  });
}

export async function installPackagedApp(rootDir = repoRoot, packageVersion = readPackageVersion(rootDir), outputDir = 'artifacts/windows') {
  const installerPath = resolvePackagedInstallerPath(rootDir, packageVersion, outputDir);
  console.log(`[windows-package] installer: ${installerPath}`);
  await runStep({
    args: createCurrentUserInstallArgs(),
    command: installerPath,
    cwd: resolve(rootDir, outputDir),
    label: 'silent install'
  });
}

async function main() {
  const mode = resolvePackageMode();
  const install = resolveInstallMode();
  const internal = resolveInternalMode();
  const fromBuilt = resolveBuiltArtifactMode();
  const packageVersion = readPackageVersion();
  const buildVersion = internal ? formatInternalBuildVersion(packageVersion) : packageVersion;
  const outputDir = internal ? INTERNAL_OUTPUT_DIR : 'artifacts/windows';
  const steps = mode === 'native' ? createNativePackageSteps(fromBuilt, internal) : createWslPackageSteps();
  console.log(`[windows-package] mode: ${mode}`);
  console.log(`[windows-package] channel: ${internal ? 'internal' : 'release'}`);
  console.log(`[windows-package] install: ${install ? 'yes' : 'no'}`);
  console.log(`[windows-package] from-built: ${fromBuilt ? 'yes' : 'no'}`);
  console.log(`[windows-package] build version: ${buildVersion}`);
  if (mode === 'native') {
    if (internal) {
      writeInternalBuilderConfig(repoRoot, buildVersion);
      rmSync(resolve(repoRoot, INTERNAL_OUTPUT_DIR), { force: true, recursive: true });
      console.log('[windows-package] internal library: D:\\X\\U\\Foliole');
    } else {
      cleanReleaseArtifacts(repoRoot, packageVersion);
    }
    if (fromBuilt && !process.argv.includes('--skip-built-artifact-check')) {
      assertBuiltArtifactsFresh();
    }
  }
  for (const step of steps) {
    await runStep(step);
  }
  if (mode === 'native') {
    const summary = collectArtifactSummary(repoRoot, buildVersion, outputDir);
    console.log(`[windows-package] artifact installer=${summary.installer} unpacked=${summary.unpacked}`);
    if (install) {
      await installPackagedApp(repoRoot, buildVersion, outputDir);
    }
    console.log(`[windows-package] status: ${resolvePackageStatusLabel(install)}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('package-windows.mjs')) {
  await main();
}
