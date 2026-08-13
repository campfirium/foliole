import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { A5_SERIAL, macosA5Paths } from '../android/macos-a5-dev.mjs';
import { currentAcceptanceCandidate } from './multi-device-sync-candidate.mjs';

/* global process */

const exec = promisify(execFile);

function run(command, args, repoRoot, timeout = 20 * 60_000, signal) {
  return exec(command, args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    signal, timeout });
}

async function prepareMacos(execute, repoRoot, progress, signal) {
  progress('candidate-macos-started');
  await execute('npm', ['run', 'build'], repoRoot, 10 * 60_000, signal);
  await execute('npm', ['run', 'electron:rebuild:native'], repoRoot, 10 * 60_000, signal);
  await execute('npm', ['run', 'electron:compile'], repoRoot, 5 * 60_000, signal);
  await execute(process.execPath, ['scripts/electron-sqlite-runner.mjs', '--preflight'],
    repoRoot, 60_000, signal);
  progress('candidate-macos-prepared');
}

async function prepareAndroid(execute, paths, repoRoot, progress, signal, assertFrozen) {
  progress('candidate-android-started');
  await execute(process.execPath, ['scripts/android/macos-a5-dev.mjs', 'build'],
    repoRoot, 12 * 60_000, signal);
  progress('candidate-android-built');
  assertFrozen();
  await execute(paths.adb, ['-s', A5_SERIAL, 'install', '-r', paths.apk], repoRoot,
    5 * 60_000, signal);
  progress('candidate-android-installed');
  await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop',
    'com.foliole.android'], repoRoot, 10_000, signal);
  await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-W', '-n',
    'com.foliole.android/.MainActivity'], repoRoot, 20_000, signal);
  progress('candidate-android-launched');
}

async function prepareWindows(candidate, execute, repoRoot, progress, signal) {
  progress('candidate-windows-started');
  const result = await execute(process.execPath,
    ['scripts/windows/windows-dev-control.mjs', 'multi-device-sync-candidate',
      '--source-ref', candidate.sourceRef], repoRoot,
    18 * 60_000, signal);
  const line = result.stdout.split(/\r?\n/u).find((value) =>
    value.startsWith('[windows-dev-control] candidate-receipt='));
  const receipt = line ? JSON.parse(line.slice(line.indexOf('=') + 1)) : null;
  if (!receipt || receipt.sourceRef !== candidate.sourceRef
      || receipt.treeDigest !== candidate.treeDigest
      || receipt.controllerDigest !== candidate.controllerDigest) {
    throw Object.assign(new Error('Windows candidate did not report the frozen boundary.'), {
      failureOwner: 'candidate', host: 'windows-c', missingFact: 'windows_candidate_unbound'
    });
  }
  progress('candidate-windows-prepared');
  return receipt;
}

export function assertCandidateStillFrozen(candidate, repoRoot,
  inspect = currentAcceptanceCandidate) {
  const current = inspect(repoRoot, candidate.mode, candidate.sourceRef);
  const keys = ['branch', 'controllerDigest', 'revision', 'sourceRef', 'treeDigest'];
  if (!current.clean || keys.some((key) => current[key] !== candidate[key])) {
    throw Object.assign(new Error('Candidate build changed the frozen source boundary.'), {
      failureOwner: 'candidate', missingFact: 'candidate_source_boundary_changed'
    });
  }
  return current;
}

export async function prepareCandidate({ candidate, execute = run, repoRoot,
  assertFrozen = () => {}, onProgress = () => {}, paths = macosA5Paths(repoRoot),
  requiredHosts, runId, signal }) {
  const hosts = new Set(requiredHosts);
  if (hosts.has('macos-a')) {
    await prepareMacos(execute, repoRoot, onProgress, signal); assertFrozen();
  }
  if (hosts.has('android-b')) {
    await prepareAndroid(execute, paths, repoRoot, onProgress, signal, assertFrozen);
  }
  const windowsReceipt = hosts.has('windows-c')
    ? await prepareWindows(candidate, execute, repoRoot, onProgress, signal) : undefined;
  const apk = path.join(repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const receipt = {
    ...(hosts.has('android-b') ? {
      androidApkSha256: createHash('sha256').update(fs.readFileSync(apk)).digest('hex')
    } : {}),
    candidateBoundary: { branch: candidate.branch, controllerDigest: candidate.controllerDigest,
      sourceRef: candidate.sourceRef, treeDigest: candidate.treeDigest },
    completedAt: new Date().toISOString(), preparedHosts: [...hosts],
    resultStatus: 'success', runId, ...(windowsReceipt ? { windowsReceipt } : {})
  };
  const evidenceRef = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'candidate-preparation.json');
  fs.mkdirSync(path.dirname(evidenceRef), { recursive: true });
  fs.writeFileSync(evidenceRef, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { evidenceRef, progress: receipt.preparedHosts.map((host) => `${host}-built`) };
}

function failureHost(activity) {
  if (activity.includes('windows')) return 'windows-c';
  if (activity.includes('android')) return 'android-b';
  if (activity.includes('macos')) return 'macos-a';
  return 'all';
}

export async function prepareCandidateStage({ execute, reportActivity, reportProgress, repoRoot,
  requiredHosts, run, runId, signal }) {
  let lastActivity = 'stage_started';
  try {
    const result = await prepareCandidate({ candidate: run.candidate, execute, repoRoot,
      assertFrozen: () => assertCandidateStillFrozen(run.candidate, repoRoot), requiredHosts, runId, signal,
      onProgress: (activity) => { lastActivity = activity; reportActivity(activity); } });
    reportProgress('candidate-prepared');
    return result;
  } catch (error) {
    const evidenceRef = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
      'candidate-preparation-failure.log');
    fs.mkdirSync(path.dirname(evidenceRef), { recursive: true });
    const detail = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
    fs.writeFileSync(evidenceRef, `${detail}\n`, 'utf8');
    throw Object.assign(error, { evidenceRef, failureOwner: error.failureOwner || 'candidate',
      host: error.host || failureHost(lastActivity), lastSuccessfulAction: lastActivity,
      missingFact: error.missingFact || 'candidate_preparation_completion' });
  }
}
