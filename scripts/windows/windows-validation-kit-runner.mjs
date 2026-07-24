#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runInstalledAppSmoke } from './installed-app-smoke.mjs';
import { executeBounded } from './windows-bounded-process.mjs';
import { WINDOWS_VALIDATION_PHYSICAL_SPECS } from './windows-validation-kit-profile.mjs';
import { verifyWindowsValidationKit } from './windows-validation-kit-verify.mjs';
import {
  archiveStaleCandidates,
  archiveValidationFailure,
  assertValidationCacheRoot,
  createValidationCandidate,
  promoteValidationCandidate,
  recoverValidationResultStore,
  writeValidationResult
} from './windows-validation-result-store.mjs';

const LOG_LINE_LIMIT = 500;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const PLAYWRIGHT_TIMEOUT_MS = 15 * 60_000;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || rest[index + 1] === undefined) throw new Error('runner arguments must be --name value pairs');
    values[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, values };
}

function expectedIdentity(values) {
  return {
    commitSha: values['expected-commit'],
    runAttempt: values['expected-run-attempt'],
    runId: values['expected-run-id']
  };
}

function runnerEnv(installerPath, evidenceDir) {
  const env = {
    ...process.env,
    FOLIOLE_DESKTOP_ACCEPTANCE_DIR: path.join(evidenceDir, 'screenshots'),
    FOLIOLE_DESKTOP_ACCEPTANCE_EVIDENCE: '1',
    FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: process.env.FOLIOLE_ELECTRON_INSTALLED_EXE_PATH || '',
    FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
    FOLIOLE_ELECTRON_NATIVE_VISIBLE: '1',
    FOLIOLE_VALIDATION_RESULT_DIR: evidenceDir,
    FOLIOLE_VALIDATION_INSTALLER_PATH: installerPath
  };
  delete env.FOLIOLE_ELECTRON_NATIVE_HIDDEN;
  return env;
}

async function runPlaywright(kitRoot, env) {
  return executeBounded(process.execPath, [
    path.join(kitRoot, 'node_modules/playwright/cli.js'),
    'test',
    '--config',
    'scripts/windows/windows-validation-kit-playwright.config.mjs',
    ...WINDOWS_VALIDATION_PHYSICAL_SPECS
  ], {
    cwd: kitRoot, env, timeoutCode: 'physical_playwright_timeout', timeoutMs: PLAYWRIGHT_TIMEOUT_MS
  });
}

function executionId(manifest) {
  return `${manifest.commitSha.slice(0, 12)}-${manifest.runId}-${manifest.runAttempt}`.toLowerCase();
}

function writeRunnerEvidence(candidateDir, progress, runnerLog) {
  const temporary = path.join(candidateDir, `progress.${process.pid}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, path.join(candidateDir, 'progress.json'));
  fs.writeFileSync(path.join(candidateDir, 'runner.log'), `${runnerLog.slice(-LOG_LINE_LIMIT).join('\n')}\n`, 'utf8');
}

export async function runWindowsValidationKit({
  cacheRoot,
  executeCommand = executeBounded,
  expected,
  kitRoot = process.cwd(),
  platform = process.platform,
  runPhysicalPlaywright = runPlaywright,
  smokeInstalledApp = runInstalledAppSmoke,
  verifyKit = verifyWindowsValidationKit
}) {
  if (platform !== 'win32') throw new Error('Windows validation run requires win32');
  const verified = verifyKit({ expected, kitRoot });
  assertValidationCacheRoot(cacheRoot);
  recoverValidationResultStore(cacheRoot);
  archiveStaleCandidates(cacheRoot);
  const id = executionId(verified.manifest);
  const candidateDir = createValidationCandidate(cacheRoot, id);
  const evidenceDir = path.join(candidateDir, 'evidence');
  fs.mkdirSync(evidenceDir);
  fs.mkdirSync(path.join(evidenceDir, 'screenshots'));
  const startedAt = new Date().toISOString();
  const steps = [
    { name: 'install', status: 'pending' },
    { name: 'readiness', status: 'pending' },
    { name: 'physical_playwright', status: 'pending' }
  ];
  let errorCode = null;
  let runnerLog = [];
  const progress = { schemaVersion: 1, startedAt, status: 'running', steps };
  const persist = (currentStage) => writeRunnerEvidence(candidateDir, { ...progress, currentStage }, runnerLog);
  try {
    persist('install');
    const install = await executeCommand(verified.installerPath, ['/currentuser', '/S'], {
      cwd: path.dirname(verified.installerPath), timeoutCode: 'installer_timeout', timeoutMs: INSTALL_TIMEOUT_MS
    });
    runnerLog.push(...install.lines);
    steps[0].status = install.code === 0 ? 'success' : 'failure';
    persist('install');
    if (install.code !== 0) throw Object.assign(new Error('installer failed'), { code: 'installer_failed' });
    persist('readiness');
    await smokeInstalledApp({ env: runnerEnv(verified.installerPath, evidenceDir) });
    steps[1].status = 'success';
    persist('physical_playwright');
    const playwright = await runPhysicalPlaywright(kitRoot, runnerEnv(verified.installerPath, evidenceDir));
    runnerLog.push(...playwright.lines);
    steps[2].status = playwright.code === 0 ? 'success' : 'failure';
    persist('physical_playwright');
    if (playwright.code !== 0) throw Object.assign(new Error('physical Playwright failed'), { code: 'physical_playwright_failed' });
  } catch (error) {
    errorCode = error.code || 'validation_run_failed';
    runnerLog.push(error instanceof Error ? error.message : String(error));
    const current = steps.find((step) => step.status === 'failure') || steps.find((step) => step.status === 'pending');
    if (current?.status === 'pending') current.status = 'failure';
    for (const step of steps) if (step.status === 'pending') step.status = 'skipped';
    progress.status = 'failure';
    progress.errorCode = errorCode;
    persist(current?.name || 'runner');
  }
  const result = {
    appVersion: verified.manifest.appVersion,
    commitSha: verified.manifest.commitSha,
    completedAt: new Date().toISOString(),
    errorCode,
    runAttempt: verified.manifest.runAttempt,
    runId: verified.manifest.runId,
    schemaVersion: 1,
    startedAt,
    status: errorCode ? 'failure' : 'success',
    steps
  };
  progress.status = result.status;
  progress.errorCode = errorCode;
  persist('completed');
  writeValidationResult(candidateDir, result);
  return errorCode
    ? { directory: archiveValidationFailure(cacheRoot, candidateDir, id), result }
    : { directory: promoteValidationCandidate(cacheRoot, candidateDir, id), result };
}

async function main(argv) {
  const { command, values } = parseArgs(argv);
  const kitRoot = path.resolve(values['kit-root'] || '.');
  const expected = expectedIdentity(values);
  if (command === 'verify') {
    verifyWindowsValidationKit({ expected, kitRoot });
    console.log('[windows-validation-kit] status: VERIFIED');
    return;
  }
  if (command !== 'run' || !values['cache-root']) throw new Error('Usage: runner <verify|run> --expected-commit SHA --expected-run-id ID --expected-run-attempt N [--cache-root PATH]');
  const outcome = await runWindowsValidationKit({ cacheRoot: path.resolve(values['cache-root']), expected, kitRoot });
  console.log(`[windows-validation-kit] status: ${outcome.result.status.toUpperCase()} evidence=${outcome.directory}`);
  if (outcome.result.status !== 'success') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[windows-validation-kit] ${error.code || 'error'}: ${error.message}`);
    process.exitCode = 1;
  });
}
