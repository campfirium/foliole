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
import {
  WINDOWS_ACCEPTANCE_CONFIG,
  resolveAcceptanceBaselineVersion,
  resolveWindowsAcceptanceOutputDir,
  writeWindowsAcceptanceBuilderConfig
} from './package-windows-acceptance-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
export function resolvePackageMode(platform = process.platform) {
  return platform === 'win32' ? 'native' : 'unsupported';
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

export function resolveInstallExistingMode(argv = process.argv) {
  return argv.includes('--install-existing');
}

export function resolveBuilderConfig(internal, env = process.env) {
  if (internal) return '.tmp/electron-builder-internal.json';
  return env.FOLIOLE_WINDOWS_BUILDER_CONFIG?.trim() || 'electron/builder.json';
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

export function createNativePackageSteps(
  fromBuilt = resolveBuiltArtifactMode(),
  internal = resolveInternalMode(),
  builderConfig = resolveBuilderConfig(internal)
) {
  const buildSteps = fromBuilt ? [] : [
    createCmdStep('renderer build', 'npm run build'),
    createCmdStep('electron compile', 'npm run electron:compile')
  ];
  return [
    ...buildSteps,
    createCmdStep('electron-builder nsis', `npm exec -- electron-builder --config ${builderConfig} --win nsis --publish never`)
  ];
}

function mergeEnv(extraEnv) {
  return { ...process.env, ...(extraEnv ?? {}) };
}

function runStep(step) {
  console.log(`[windows-package] step: ${step.label}`);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: step.cwd ?? repoRoot,
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
  if (mode !== 'native') {
    throw new Error('Windows packaging requires a Windows checkout; WSL mirror packaging has been retired');
  }
  const install = resolveInstallMode();
  const internal = resolveInternalMode();
  const fromBuilt = resolveBuiltArtifactMode();
  const installExisting = resolveInstallExistingMode();
  const packageVersion = readPackageVersion();
  const acceptanceVersion = resolveAcceptanceBaselineVersion();
  if (internal && acceptanceVersion) {
    throw new Error('--internal cannot be combined with --acceptance-baseline-version');
  }
  const buildVersion = acceptanceVersion ?? (internal ? formatInternalBuildVersion(packageVersion) : packageVersion);
  const outputDir = acceptanceVersion
    ? resolveWindowsAcceptanceOutputDir(acceptanceVersion)
    : (internal ? INTERNAL_OUTPUT_DIR : 'artifacts/windows');
  if (installExisting) {
    if (internal || fromBuilt) throw new Error('--install-existing cannot be combined with package modes');
    await installPackagedApp(repoRoot, buildVersion, outputDir);
    console.log('[windows-package] status: PACKAGED_AND_INSTALLED');
    return;
  }
  let builderConfig = resolveBuilderConfig(internal);
  if (acceptanceVersion) {
    builderConfig = writeWindowsAcceptanceBuilderConfig(repoRoot, builderConfig, acceptanceVersion);
    rmSync(resolve(repoRoot, outputDir), { force: true, recursive: true });
  }
  const steps = createNativePackageSteps(fromBuilt, internal, builderConfig);
  console.log(`[windows-package] mode: ${mode}`);
  console.log(`[windows-package] channel: ${internal ? 'internal' : 'release'}`);
  console.log(`[windows-package] install: ${install ? 'yes' : 'no'}`);
  console.log(`[windows-package] from-built: ${fromBuilt ? 'yes' : 'no'}`);
  console.log(`[windows-package] build version: ${buildVersion}`);
  if (acceptanceVersion) console.log(`[windows-package] acceptance config: ${WINDOWS_ACCEPTANCE_CONFIG}`);
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
  for (const step of steps) {
    await runStep(step);
  }
  const summary = collectArtifactSummary(repoRoot, buildVersion, outputDir);
  console.log(`[windows-package] artifact installer=${summary.installer} unpacked=${summary.unpacked}`);
  if (install) {
    await installPackagedApp(repoRoot, buildVersion, outputDir);
  }
  console.log(`[windows-package] status: ${resolvePackageStatusLabel(install)}`);
}

if (process.argv[1] && process.argv[1].endsWith('package-windows.mjs')) {
  main().catch((error) => {
    console.error(`[windows-package] status: FAILED reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
