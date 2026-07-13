#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { downloadArtifact, extractArtifact, resolveArtifact } from './windows-device-artifact.mjs';
import { devicePaths, readJson, taskIdentity, writeJsonAtomic } from './windows-device-state.mjs';

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

function evidenceFromOutput(output) {
  const match = output.match(/evidence=([^\r\n]+)$/mu);
  return match?.[1]?.trim();
}

export async function runWindowsDeviceWorker({
  downloadArtifactImpl = downloadArtifact,
  executeCommand = execute,
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
  writeJsonAtomic(paths.status, { identity, pid: process.pid, schemaVersion: 1, startedAt, state: 'running' });
  try {
    const token = fs.readFileSync(paths.githubToken, 'utf8').trim();
    if (!token) throw Object.assign(new Error('GitHub token is empty'), { code: 'github_token_missing' });
    fs.mkdirSync(paths.root, { recursive: true });
    const artifact = await resolveArtifactImpl(request, { token });
    await downloadArtifactImpl(artifact, paths.artifact, { token });
    const kitRoot = await extractArtifactImpl(paths.artifact, paths.candidate);
    const runner = path.join(kitRoot, 'scripts', 'windows', 'windows-validation-kit-runner.mjs');
    const cacheRoot = path.join(paths.root, 'validation-results');
    const result = await executeCommand(process.execPath, [runner, 'run', '--expected-commit', request.commitSha, '--expected-run-id', request.runId, '--expected-run-attempt', artifact.runAttempt, '--cache-root', cacheRoot], { cwd: kitRoot });
    const evidenceRoot = evidenceFromOutput(result.output);
    writeJsonAtomic(paths.status, {
      completedAt: new Date().toISOString(), evidenceRoot, identity, resultStatus: result.code === 0 ? 'success' : 'failure',
      schemaVersion: 1, startedAt, state: 'completed'
    });
    if (result.code !== 0) process.exitCode = 1;
  } catch (error) {
    const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    fs.writeFileSync(path.join(paths.root, 'worker-error.log'), `${error.code || 'device_worker_failed'}: ${errorMessage}\n`, 'utf8');
    writeJsonAtomic(paths.status, {
      completedAt: new Date().toISOString(), errorCode: error.code || 'device_worker_failed', errorMessage, identity,
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
