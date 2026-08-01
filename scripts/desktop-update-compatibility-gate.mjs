#!/usr/bin/env node
/* global console, process */

import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const executeFile = promisify(execFile);

function readArg(name, argv = process.argv.slice(2)) {
  return argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function defaultElectronExecutable(platform, repositoryRoot = ROOT) {
  const dist = path.join(repositoryRoot, 'node_modules/electron/dist');
  return platform === 'darwin'
    ? path.join(dist, 'Electron.app/Contents/MacOS/Electron')
    : path.join(dist, 'electron.exe');
}

export function resolveCompatibilityGateArgs(argv, platform = process.platform) {
  const directory = readArg('directory', argv);
  const targetVersion = readArg('target-version', argv);
  const currentVersion = readArg('current-version', argv);
  if (!directory || !targetVersion || !currentVersion) {
    throw new Error('--directory, --current-version, and --target-version are required.');
  }
  if (!['darwin', 'win32'].includes(platform)) {
    throw new Error(`desktop updater compatibility gate does not support ${platform}.`);
  }
  return {
    currentVersion,
    directory: path.resolve(directory),
    electronExecutable: path.resolve(readArg('electron', argv) ?? defaultElectronExecutable(platform)),
    platform,
    targetVersion,
    updaterModule: path.resolve(readArg('updater-module', argv) ?? path.join(ROOT, 'node_modules/electron-updater'))
  };
}

function parseEvidence(stdout) {
  const line = stdout.split(/\r?\n/u).find((entry) => entry.startsWith('[desktop-update-electron-runtime] {'));
  if (!line) throw new Error('Electron updater runtime did not return evidence.');
  return JSON.parse(line.slice('[desktop-update-electron-runtime] '.length));
}

async function createHarness(root, version) {
  const appRoot = path.join(root, 'app');
  await mkdir(appRoot, { recursive: true });
  await copyFile(path.join(ROOT, 'scripts/desktop-update-electron-runtime-probe.cjs'), path.join(appRoot, 'main.cjs'));
  await writeFile(path.join(appRoot, 'package.json'), `${JSON.stringify({
    main: 'main.cjs', name: 'foliole-update-runtime-gate', productName: 'Foliole', version
  }, null, 2)}\n`);
  return appRoot;
}

export async function runCompatibilityGate(options, execute = executeFile) {
  const temporaryParent = path.resolve(process.env.RUNNER_TEMP ?? path.join(ROOT, '.tmp'));
  await mkdir(temporaryParent, { recursive: true });
  const root = await mkdtemp(path.join(temporaryParent, 'foliole-update-runtime-'));
  try {
    const appRoot = await createHarness(root, options.currentVersion);
    let result;
    try {
      result = await execute(options.electronExecutable, [appRoot], {
        cwd: ROOT,
        env: {
          ...process.env,
          FOLIOLE_UPDATE_ARTIFACT_DIRECTORY: options.directory,
          FOLIOLE_UPDATE_HARNESS_ROOT: root,
          FOLIOLE_UPDATE_TARGET_VERSION: options.targetVersion,
          FOLIOLE_UPDATER_MODULE: options.updaterModule
        },
        maxBuffer: 2 * 1024 * 1024,
        timeout: 120_000
      });
    } catch (error) {
      const detail = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`.trim();
      const status = [error?.code, error?.signal].filter(Boolean).join('/');
      throw new Error(
        `Electron updater runtime failed${status ? ` (${status})` : ''}${detail ? `:\n${detail}` : '.'}`
      );
    }
    const evidence = parseEvidence(result.stdout);
    if (evidence.executor !== 'ElectronHttpExecutor') {
      throw new Error(`expected ElectronHttpExecutor; received ${evidence.executor ?? '<none>'}.`);
    }
    if (evidence.targetVersion !== options.targetVersion) {
      throw new Error(`updater resolved ${evidence.targetVersion ?? '<none>'}; expected ${options.targetVersion}.`);
    }
    return evidence;
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function main() {
  assertQualityCommandAllowed('runner:desktop-update-release-gate');
  const options = resolveCompatibilityGateArgs(process.argv.slice(2));
  const result = await runCompatibilityGate(options);
  console.log(
    `[desktop-update-compatibility] status: VERIFIED from=${options.currentVersion} ` +
    `to=${result.targetVersion} updater=${result.updater} executor=${result.executor}`
  );
}

export async function runCompatibilityGateCli(execute, runtime = process, logger = console) {
  try {
    await execute();
    runtime.exitCode = 0;
  } catch (error) {
    logger.error(`[desktop-update-compatibility] ${error instanceof Error ? error.message : String(error)}`);
    runtime.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await runCompatibilityGateCli(main);
}
