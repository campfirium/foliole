#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { downloadArtifact, extractArtifact, resolveArtifact } from './windows-device-artifact.mjs';
import { executeBounded } from './windows-bounded-process.mjs';
import { devicePaths, readJson, taskIdentity, writeJsonAtomic } from './windows-device-state.mjs';

const VALIDATION_RUNNER_TIMEOUT_MS = 35 * 60_000;

function evidenceFromOutput(output) {
  const match = output.match(/evidence=([^\r\n]+)$/mu);
  return match?.[1]?.trim();
}

function candidateEvidenceRoot(cacheRoot, request, runAttempt) {
  const id = `${request.commitSha.slice(0, 12)}-${request.runId}-${runAttempt}`.toLowerCase();
  return path.join(cacheRoot, 'candidate', id);
}

function writeProgress(evidenceRoot, phase) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  writeJsonAtomic(path.join(evidenceRoot, 'progress.json'), {
    phase, schemaVersion: 1, status: 'running', updatedAt: new Date().toISOString()
  });
}

export async function runWindowsDeviceWorker({
  downloadArtifactImpl = downloadArtifact,
  executeCommand = executeBounded,
  extractArtifactImpl = extractArtifact,
  paths = devicePaths(),
  platform = process.platform,
  resolveArtifactImpl = resolveArtifact
} = {}) {
  if (platform !== 'win32') throw new Error('Windows device worker requires win32');
  const request = readJson(paths.active);
  if (!request) throw new Error('active device request is missing');
  const identity = taskIdentity(request);
  const startedAt = new Date().toISOString();
  const workerEvidence = path.join(paths.root, 'worker-evidence', identity.replace(':', '-'));
  const status = { evidenceRoot: workerEvidence, identity, phase: 'artifact_lookup', pid: process.pid, schemaVersion: 1, startedAt, state: 'running' };
  writeProgress(workerEvidence, 'artifact_lookup');
  writeJsonAtomic(paths.status, status);
  try {
    const token = fs.readFileSync(paths.githubToken, 'utf8').trim();
    if (!token) throw Object.assign(new Error('GitHub token is empty'), { code: 'github_token_missing' });
    fs.mkdirSync(paths.root, { recursive: true });
    const artifact = await resolveArtifactImpl(request, { token });
    writeProgress(workerEvidence, 'artifact_download');
    writeJsonAtomic(paths.status, { ...status, phase: 'artifact_download' });
    await downloadArtifactImpl(artifact, paths.artifact, { token });
    writeProgress(workerEvidence, 'artifact_extract');
    writeJsonAtomic(paths.status, { ...status, phase: 'artifact_extract' });
    const kitRoot = await extractArtifactImpl(paths.artifact, paths.candidate);
    const runner = path.join(kitRoot, 'scripts', 'windows', 'windows-validation-kit-runner.mjs');
    const cacheRoot = path.join(paths.root, 'validation-results');
    const candidateRoot = candidateEvidenceRoot(cacheRoot, request, artifact.runAttempt);
    writeJsonAtomic(paths.status, { ...status, evidenceRoot: candidateRoot, phase: 'validation_runner' });
    const result = await executeCommand(process.execPath, [runner, 'run', '--expected-commit', request.commitSha, '--expected-run-id', request.runId, '--expected-run-attempt', artifact.runAttempt, '--cache-root', cacheRoot], {
      cwd: kitRoot, timeoutCode: 'validation_kit_timeout', timeoutMs: VALIDATION_RUNNER_TIMEOUT_MS
    });
    const evidenceRoot = evidenceFromOutput(result.output) || candidateRoot;
    writeJsonAtomic(paths.status, {
      completedAt: new Date().toISOString(), evidenceRoot, identity, phase: 'completed', resultStatus: result.code === 0 ? 'success' : 'failure',
      schemaVersion: 1, startedAt, state: 'completed'
    });
    if (result.code !== 0) process.exitCode = 1;
  } catch (error) {
    const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    fs.writeFileSync(path.join(paths.root, 'worker-error.log'), `${error.code || 'device_worker_failed'}: ${errorMessage}\n`, 'utf8');
    writeJsonAtomic(paths.status, {
      ...readJson(paths.status, status), completedAt: new Date().toISOString(), errorCode: error.code || 'device_worker_failed', errorMessage, identity,
      resultStatus: 'failure', schemaVersion: 1, startedAt, state: 'completed'
    });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsDeviceWorker().catch((error) => {
    console.error(`[windows-device-worker] ${error.code || 'error'}: ${error.message}`);
    process.exitCode = 1;
  });
}
