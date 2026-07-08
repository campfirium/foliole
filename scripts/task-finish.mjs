/* global process */

import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inferPreviewTargetsFromFiles as inferPreviewTargetsFromDomain } from './lib/path-domains.mjs';
import {
  collectPreviewDiagnostics,
  formatPreviewDiagnostics
} from './task-finish-preview-diagnostics.mjs';

export { collectPreviewDiagnostics };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUCCESS_PREVIEW_STATUSES = {
  android: new Set(['OPENED', 'STARTED', 'SYNCED']),
  windows: new Set(['STARTED'])
};
const RETRYABLE_PREVIEW_STATUSES = {
  android: new Set(),
  windows: new Set(['RESTART_REQUESTED'])
};
const PREVIEW_TARGETS = ['android', 'windows'];

function normalizeGitStatusPath(rawPath) {
  const trimmed = rawPath.trim();
  const arrowIndex = trimmed.indexOf('->');
  if (arrowIndex === -1) {
    return trimmed;
  }
  return trimmed.slice(arrowIndex + 2).trim();
}

export function extractPreviewStatus(output, target) {
  const matches = [...output.matchAll(new RegExp(`\\[${target}-preview\\] status:\\s*([A-Z_]+)`, 'g'))];
  return matches.at(-1)?.[1] ?? null;
}

export function defaultWindowsPreviewRunner({ cwd = REPO_ROOT, env = process.env } = {}) {
  return defaultPreviewRunner({
    command: ['npm', ['run', 'windows:preview']],
    cwd,
    env
  });
}

export function defaultAndroidPreviewRunner({ cwd = REPO_ROOT, env = process.env } = {}) {
  return defaultPreviewRunner({
    command: ['npm', ['run', 'android:preview']],
    cwd,
    env
  });
}

function defaultPreviewRunner({ command, cwd = REPO_ROOT, env = process.env } = {}) {
  const [binary, args] = command;
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

function runGitStatus({ cwd = REPO_ROOT, env = process.env } = {}) {
  try {
    return execFileSync('git', ['status', '--short'], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    return '';
  }
}

export function resolveChangedFiles(statusOutput) {
  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 4)
    .map((line) => normalizeGitStatusPath(line.slice(3)))
    .filter((filePath) => filePath.length > 0);
}

export function inferPreviewTargetsFromFiles(changedFiles) {
  return inferPreviewTargetsFromDomain(changedFiles);
}

export function resolvePreviewTargets({
  changedFiles,
  env = process.env,
  requestedTarget = env.FOLIOLE_PREVIEW_TARGET ?? null
} = {}) {
  const normalizedRequest = requestedTarget?.trim().toLowerCase() ?? '';
  if (normalizedRequest === 'android' || normalizedRequest === 'windows') {
    return [normalizedRequest];
  }
  if (normalizedRequest === 'both') {
    return [...PREVIEW_TARGETS];
  }
  if (normalizedRequest === 'none') {
    return [];
  }
  const inferredTargets = inferPreviewTargetsFromFiles(changedFiles ?? []);
  return inferredTargets.length > 0 ? inferredTargets : ['windows'];
}

export async function runTaskFinish({
  cwd = REPO_ROOT,
  env = process.env,
  runAndroidPreview = defaultAndroidPreviewRunner,
  runWindowsPreview = defaultWindowsPreviewRunner,
  collectDiagnostics = collectPreviewDiagnostics,
  maxAttempts = 2,
  changedFiles = resolveChangedFiles(runGitStatus({ cwd, env })),
  requestedTarget = env.FOLIOLE_PREVIEW_TARGET ?? null
} = {}) {
  const previewTargets = resolvePreviewTargets({ changedFiles, env, requestedTarget });
  if (previewTargets.length === 0) {
    return {
      attemptCount: 0,
      changedFiles,
      diagnostics: null,
      executed: false,
      exitCode: 0,
      previewResults: [],
      previewStatus: 'SKIPPED',
      previewTarget: 'none',
      previewTargets,
      status: 'SKIPPED'
    };
  }

  const previewResults = [];

  for (const target of previewTargets) {
    const runPreview = target === 'android' ? runAndroidPreview : runWindowsPreview;
    let previewResult = null;
    let previewStatus = null;
    let attemptCount = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attemptCount = attempt;
      previewResult = await runPreview({ cwd, env });
      previewStatus = extractPreviewStatus(previewResult.stdout, target);
      if (previewResult.code === 0 && SUCCESS_PREVIEW_STATUSES[target].has(previewStatus ?? '')) {
        break;
      }
      if (!(previewResult.code === 0 && RETRYABLE_PREVIEW_STATUSES[target].has(previewStatus ?? '') && attempt < maxAttempts)) {
        break;
      }
    }

    const diagnosticsNeeded =
      target === 'windows' && (previewResult?.code !== 0 || !SUCCESS_PREVIEW_STATUSES[target].has(previewStatus ?? ''));
    const diagnostics = diagnosticsNeeded ? await collectDiagnostics({ cwd, env }) : null;
    const successful = previewResult?.code === 0 && SUCCESS_PREVIEW_STATUSES[target].has(previewStatus ?? '');

    previewResults.push({
      ...previewResult,
      attemptCount,
      diagnostics,
      previewStatus,
      target,
      successful
    });
  }

  const failedPreview = previewResults.find((entry) => !entry.successful);
  const primaryPreview = previewResults.at(-1) ?? null;

  return {
    ...(primaryPreview ?? {}),
    changedFiles,
    diagnostics: failedPreview?.diagnostics ?? null,
    executed: true,
    exitCode: failedPreview ? 1 : 0,
    previewResults,
    previewStatus: failedPreview?.previewStatus ?? primaryPreview?.previewStatus ?? null,
    previewTarget: failedPreview?.target ?? primaryPreview?.target ?? null,
    previewTargets,
    status: failedPreview ? 'FAILED' : 'EXECUTED'
  };
}

async function main() {
  const result = await runTaskFinish();
  if (!result.executed) {
    process.stdout.write('[task-finish] preview skipped: no target selected\n');
    process.exit(result.exitCode);
  }
  for (const previewResult of result.previewResults ?? []) {
    process.stdout.write(
      `[task-finish] ${previewResult.target} preview ${previewResult.successful ? 'executed' : 'failed'}: ${
        previewResult.previewStatus ?? 'status-unavailable'
      }\n`
    );
  }
  if (result.previewTarget === 'windows' && result.diagnostics) {
    process.stdout.write(`${formatPreviewDiagnostics(result.diagnostics)}\n`);
  }
  process.exit(result.exitCode);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main();
}
