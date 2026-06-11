#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBuiltArtifactsFresh } from './package-built-artifacts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const WINDOWS_REPO_ROOT = 'D:\\C\\foliole';
const WINDOWS_NODE_DIR = 'D:\\R\\nodejs';

export function resolvePackageMode(argv = process.argv, platform = process.platform) {
  return argv.includes('--native') || platform === 'win32' ? 'native' : 'wsl';
}

export function resolveInstallMode(argv = process.argv) {
  return argv.includes('--install');
}

export function resolveBuiltArtifactMode(argv = process.argv) {
  return argv.includes('--from-built');
}

export function resolvePackageStatusLabel(install) {
  return install ? 'PACKAGED_AND_INSTALLED' : 'PACKAGED';
}

function createCmdStep(label, command) {
  return {
    args: ['/d', '/s', '/c', command],
    command: 'cmd.exe',
    label
  };
}

export function createNativePackageSteps(fromBuilt = resolveBuiltArtifactMode()) {
  const buildSteps = fromBuilt ? [] : [
    createCmdStep('renderer build', 'npm run build'),
    createCmdStep('electron compile', 'npm run electron:compile')
  ];
  return [
    ...buildSteps,
    createCmdStep('electron-builder nsis', 'npm exec -- electron-builder --config electron/builder.json --win nsis --publish never')
  ];
}

export function createWslPackageSteps(rootDir = repoRoot, install = resolveInstallMode(), fromBuilt = resolveBuiltArtifactMode()) {
  const nativeArgs = [];
  if (fromBuilt) {
    nativeArgs.push('--from-built', '--skip-built-artifact-check');
  }
  if (install) {
    nativeArgs.push('--install');
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
        WINDOWS_SYNC_INCLUDE_DIST: fromBuilt ? '1' : '',
        WINDOWS_SYNC_INCLUDE_ELECTRON_DIST: '1'
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

function directorySizeBytes(path) {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const childPath = resolve(path, entry.name);
    if (entry.isDirectory()) {
      total += directorySizeBytes(childPath);
    } else if (entry.isFile()) {
      total += statSync(childPath).size;
    }
  }
  return total;
}

export function formatBytes(bytes) {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export function readPackageVersion(rootDir = repoRoot) {
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  return packageJson.version;
}

function resolveInstallerBaseName(packageVersion) {
  return `Foliole Setup ${packageVersion}`;
}

function isInstallerArtifact(fileName, packageVersion) {
  return (
    fileName.endsWith('.exe') &&
    fileName.includes('Foliole') &&
    fileName.includes('Setup') &&
    fileName.includes(packageVersion)
  );
}

export function collectInstallerArtifactPaths(rootDir = repoRoot, packageVersion = readPackageVersion(rootDir)) {
  const releaseDir = resolve(rootDir, 'release');
  if (!existsSync(releaseDir)) {
    return [];
  }
  return readdirSync(releaseDir)
    .filter((fileName) => isInstallerArtifact(fileName, packageVersion))
    .sort()
    .map((fileName) => resolve(releaseDir, fileName));
}

export function resolvePackagedInstallerPath(rootDir = repoRoot, packageVersion = readPackageVersion(rootDir)) {
  const candidates = collectInstallerArtifactPaths(rootDir, packageVersion);
  if (candidates.length === 0) {
    throw new Error(`No Foliole Windows installer found for version ${packageVersion}`);
  }
  return candidates
    .map((candidate) => ({ path: candidate, mtimeMs: statSync(candidate).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0].path;
}

export function resolveReleaseArtifactPaths(rootDir = repoRoot, packageVersion = readPackageVersion(rootDir)) {
  const installerBaseName = resolveInstallerBaseName(packageVersion);
  const installerArtifacts = collectInstallerArtifactPaths(rootDir, packageVersion);
  const installerBlockmaps = installerArtifacts.map((artifactPath) => `${artifactPath}.blockmap`);
  return [
    resolve(rootDir, 'release/win-unpacked'),
    resolve(rootDir, 'release/win-unpacked.tmp'),
    resolve(rootDir, `release/${installerBaseName}.exe`),
    resolve(rootDir, `release/${installerBaseName}.exe.blockmap`),
    ...installerArtifacts,
    ...installerBlockmaps,
    resolve(rootDir, 'release/latest.yml'),
    resolve(rootDir, 'release/builder-debug.yml')
  ];
}

export function cleanReleaseArtifacts(rootDir = repoRoot) {
  for (const artifactPath of resolveReleaseArtifactPaths(rootDir)) {
    rmSync(artifactPath, { force: true, recursive: true });
  }
}

export function collectArtifactSummary(rootDir = process.cwd(), packageVersion = readPackageVersion(rootDir)) {
  const installerPath = collectInstallerArtifactPaths(rootDir, packageVersion)[0] ??
    resolve(rootDir, `release/${resolveInstallerBaseName(packageVersion)}.exe`);
  const unpackedPath = resolve(rootDir, 'release/win-unpacked');
  return {
    installer: existsSync(installerPath) ? formatBytes(statSync(installerPath).size) : 'missing',
    unpacked: existsSync(unpackedPath) ? formatBytes(directorySizeBytes(unpackedPath)) : 'missing'
  };
}

export async function installPackagedApp(rootDir = repoRoot, packageVersion = readPackageVersion(rootDir)) {
  const installerPath = resolvePackagedInstallerPath(rootDir, packageVersion);
  console.log(`[windows-package] installer: ${installerPath}`);
  await runStep({
    args: ['/S'],
    command: installerPath,
    cwd: resolve(rootDir, 'release'),
    label: 'silent install'
  });
}

async function main() {
  const mode = resolvePackageMode();
  const install = resolveInstallMode();
  const fromBuilt = resolveBuiltArtifactMode();
  const steps = mode === 'native' ? createNativePackageSteps() : createWslPackageSteps();
  console.log(`[windows-package] mode: ${mode}`);
  console.log(`[windows-package] install: ${install ? 'yes' : 'no'}`);
  console.log(`[windows-package] from-built: ${fromBuilt ? 'yes' : 'no'}`);
  if (mode === 'native') {
    cleanReleaseArtifacts();
    if (fromBuilt && !process.argv.includes('--skip-built-artifact-check')) {
      assertBuiltArtifactsFresh();
    }
  }
  for (const step of steps) {
    await runStep(step);
  }
  if (mode === 'native') {
    const summary = collectArtifactSummary();
    console.log(`[windows-package] artifact installer=${summary.installer} unpacked=${summary.unpacked}`);
    if (install) {
      await installPackagedApp();
    }
    console.log(`[windows-package] status: ${resolvePackageStatusLabel(install)}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('package-windows.mjs')) {
  await main();
}
