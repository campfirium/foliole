/* global process */

import { promises as fs } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUCCESS_PREVIEW_STATUSES = {
  android: new Set(['OPENED', 'STARTED', 'SYNCED']),
  windows: new Set(['STARTED', 'SYNCED'])
};
const RETRYABLE_PREVIEW_STATUSES = {
  android: new Set(),
  windows: new Set(['RESTART_REQUESTED'])
};
const PREVIEW_LOG_TAIL_LIMIT = 12;
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

function isAndroidTargetFile(filePath) {
  return (
    filePath.startsWith('android/') ||
    filePath.startsWith('scripts/android/') ||
    filePath.startsWith('src/companion/') ||
    filePath === 'capacitor.config.ts'
  );
}

function isWindowsTargetFile(filePath) {
  return (
    filePath.startsWith('electron/') ||
    filePath.startsWith('scripts/windows/') ||
    filePath.startsWith('src/app/') ||
    filePath.startsWith('src/features/') ||
    filePath.startsWith('src/store/') ||
    filePath === 'src/main.tsx' ||
    filePath === 'index.html'
  );
}

function isSharedTargetFile(filePath) {
  return (
    filePath.startsWith('src/shared/') ||
    filePath.startsWith('lib/') ||
    filePath === 'package.json' ||
    filePath === 'package-lock.json' ||
    filePath === 'vite.config.ts' ||
    filePath === 'tailwind.config.js' ||
    filePath === 'postcss.config.js' ||
    filePath === 'knip.config.ts'
  );
}

export function inferPreviewTargetsFromFiles(changedFiles) {
  const specificTargets = new Set();
  let hasSharedFiles = false;
  for (const filePath of changedFiles) {
    if (isAndroidTargetFile(filePath)) {
      specificTargets.add('android');
    }
    if (isWindowsTargetFile(filePath)) {
      specificTargets.add('windows');
    }
    if (isSharedTargetFile(filePath)) {
      hasSharedFiles = true;
    }
  }
  if (specificTargets.size > 0) {
    return PREVIEW_TARGETS.filter((target) => specificTargets.has(target));
  }
  if (hasSharedFiles) {
    return [...PREVIEW_TARGETS];
  }
  return [];
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

function toWslPath(maybeWindowsPath) {
  if (!maybeWindowsPath || maybeWindowsPath.trim().length === 0) {
    return null;
  }
  try {
    return execFileSync('wslpath', ['-u', maybeWindowsPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readNdjsonTail(filePath, limit = PREVIEW_LOG_TAIL_LIMIT) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
  } catch {
    return [];
  }
}

function resolvePreviewStateRoots({ cwd = REPO_ROOT, env = process.env } = {}) {
  const roots = [
    env.WINDOWS_RESTART_INTENT_ROOT,
    env.WINDOWS_RENDERER_RELOAD_INTENT_ROOT,
    toWslPath(env.WINDOWS_WORKDIR),
    cwd
  ]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => path.resolve(value));
  return [...new Set(roots)];
}

export async function collectPreviewDiagnostics({ cwd = REPO_ROOT, env = process.env } = {}) {
  const stateRoots = resolvePreviewStateRoots({ cwd, env });
  const diagnosticsByRoot = await Promise.all(
    stateRoots.map(async (stateRoot) => {
      const bootReadyMarkerPath = path.join(stateRoot, '.windows-native-boot-ready.json');
      const bridgeReadyMarkerPath = path.join(stateRoot, '.windows-native-bridge-ready.json');
      const bootEventLogPath = path.join(stateRoot, 'logs', 'windows', 'native-boot-events.ndjson');
      const rendererStateLogPath = path.join(stateRoot, 'logs', 'windows', 'renderer-state.ndjson');

      const [bootReadyMarker, bridgeReadyMarker, bootEvents, rendererStateEntries] = await Promise.all([
        readJsonFile(bootReadyMarkerPath),
        readJsonFile(bridgeReadyMarkerPath),
        readNdjsonTail(bootEventLogPath),
        readNdjsonTail(rendererStateLogPath)
      ]);

      const latestBootEvent = bootEvents.at(-1) ?? null;
      const latestRendererState = [...rendererStateEntries]
        .reverse()
        .find((entry) => entry?.snapshot && typeof entry.snapshot === 'object') ?? null;

      return {
        bootEventLogPath,
        bootReadyMarker,
        bootReadyMarkerPath,
        bridgeReadyMarker,
        bridgeReadyMarkerPath,
        latestBootEvent,
        latestRendererState,
        rendererStateLogPath,
        stateRoot
      };
    })
  );

  const preferred =
    diagnosticsByRoot.find(
      (entry) => entry.latestBootEvent || entry.latestRendererState || entry.bootReadyMarker || entry.bridgeReadyMarker
    ) ?? diagnosticsByRoot[0];

  return preferred ?? null;
}

function formatPreviewDiagnostics(diagnostics) {
  if (!diagnostics) {
    return '[task-finish] preview diagnostics unavailable';
  }

  const lines = ['[task-finish] preview diagnostics'];
  lines.push(
    `latest boot stage: ${diagnostics.latestBootEvent?.stage ?? 'missing'}`
  );
  lines.push(
    `app-ready marker: ${diagnostics.bootReadyMarker?.stage ?? 'missing'}`
  );
  lines.push(
    `bridge-ready marker: ${diagnostics.bridgeReadyMarker?.stage ?? 'missing'}`
  );
  if (diagnostics.latestRendererState?.label) {
    lines.push(`latest renderer snapshot: ${diagnostics.latestRendererState.label}`);
  }
  const rendererSnapshot = diagnostics.latestRendererState?.snapshot;
  if (rendererSnapshot && typeof rendererSnapshot === 'object') {
    lines.push(
      `renderer readyState: ${rendererSnapshot.readyState ?? 'unknown'} rootPresent=${String(rendererSnapshot.rootPresent ?? 'unknown')}`
    );
    lines.push(`renderer href: ${rendererSnapshot.href ?? 'unknown'}`);
    if (rendererSnapshot.error) {
      lines.push(`renderer error: ${rendererSnapshot.error}`);
    }
  }
  return lines.join('\n');
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
