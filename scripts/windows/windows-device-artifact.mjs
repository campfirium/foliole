/* global fetch */

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { URLSearchParams } from 'node:url';

const API_ROOT = 'https://api.github.com/repos/campfirium/foliole';
const ARTIFACT_NAME = 'foliole-windows-release';
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 5000;

function githubHeaders(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'foliole-windows-device',
    'x-github-api-version': '2022-11-28'
  };
}

async function checkedResponse(response, label) {
  if (response.ok) return response;
  const body = (await response.text()).slice(0, 300);
  const error = new Error(`${label} failed with HTTP ${response.status}: ${body}`);
  error.code = response.status === 401 ? 'github_auth_failed' : 'github_request_failed';
  throw error;
}

export async function resolveArtifact(request, { fetchImpl = fetch, token }) {
  const runResponse = await fetchImpl(`${API_ROOT}/actions/runs/${request.runId}`, { headers: githubHeaders(token) });
  const run = await (await checkedResponse(runResponse, 'workflow run lookup')).json();
  if (run.head_sha !== request.commitSha) throw Object.assign(new Error('workflow run commit does not match request'), { code: 'artifact_identity_mismatch' });
  if (run.status !== 'completed' || run.conclusion !== 'success' || !Number.isSafeInteger(run.run_attempt)) {
    throw Object.assign(new Error('workflow run is not a completed successful attempt'), { code: 'workflow_run_unavailable' });
  }
  const query = new URLSearchParams({ name: ARTIFACT_NAME, per_page: '10' });
  const response = await fetchImpl(`${API_ROOT}/actions/runs/${request.runId}/artifacts?${query}`, { headers: githubHeaders(token) });
  const payload = await (await checkedResponse(response, 'artifact lookup')).json();
  const matches = payload.artifacts?.filter((artifact) => artifact.name === ARTIFACT_NAME && !artifact.expired) || [];
  if (matches.length !== 1) throw Object.assign(new Error('expected exactly one unexpired Windows release artifact'), { code: 'artifact_not_unique' });
  const artifact = matches[0];
  if (artifact.workflow_run?.head_sha !== request.commitSha) throw Object.assign(new Error('artifact commit does not match request'), { code: 'artifact_identity_mismatch' });
  if (!/^sha256:[0-9a-f]{64}$/u.test(artifact.digest || '')) throw Object.assign(new Error('artifact digest is missing or invalid'), { code: 'artifact_digest_invalid' });
  if (artifact.size_in_bytes > MAX_ARCHIVE_BYTES) throw Object.assign(new Error('artifact exceeds download limit'), { code: 'artifact_too_large' });
  return { ...artifact, runAttempt: String(run.run_attempt) };
}

export async function downloadArtifact(artifact, outputPath, { fetchImpl = fetch, token }) {
  const response = await fetchImpl(artifact.archive_download_url, { headers: githubHeaders(token), redirect: 'follow' });
  await checkedResponse(response, 'artifact download');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_ARCHIVE_BYTES) throw Object.assign(new Error('artifact exceeds download limit'), { code: 'artifact_too_large' });
  const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== artifact.digest) throw Object.assign(new Error('artifact archive digest mismatch'), { code: 'artifact_digest_mismatch' });
  fs.writeFileSync(outputPath, bytes, { mode: 0o600 });
}

function execute(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`${command} failed: ${output.slice(-500)}`)));
  });
}

export function validateArchiveEntries(output) {
  const entries = output.split(/\r?\n/u).filter(Boolean);
  if (entries.length === 0 || entries.length > MAX_ARCHIVE_FILES) throw new Error('artifact archive file count is invalid');
  for (const entry of entries) {
    const normalized = entry.replaceAll('\\', '/');
    if (normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized) || normalized.split('/').includes('..')) throw new Error(`unsafe artifact archive entry: ${entry}`);
  }
  return entries;
}

export async function extractArtifact(archivePath, candidatePath, { executeCommand = execute } = {}) {
  const entries = validateArchiveEntries(await executeCommand('tar.exe', ['-tf', archivePath]));
  fs.rmSync(candidatePath, { force: true, recursive: true });
  fs.mkdirSync(candidatePath, { recursive: true });
  await executeCommand('tar.exe', ['-xf', archivePath, '-C', candidatePath]);
  const kitRoot = path.join(candidatePath, 'validation-kit');
  if (!entries.some((entry) => entry.replaceAll('\\', '/').startsWith('validation-kit/')) || !fs.existsSync(kitRoot)) throw new Error('validation kit is missing from artifact');
  return kitRoot;
}
