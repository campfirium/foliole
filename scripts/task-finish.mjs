/* global process */

import { promises as fs } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUCCESS_PREVIEW_STATUSES = new Set(['STARTED', 'SYNCED']);
const RETRYABLE_PREVIEW_STATUSES = new Set(['RESTART_REQUESTED']);
const PREVIEW_LOG_TAIL_LIMIT = 12;

export function extractWindowsPreviewStatus(output) {
  const matches = [...output.matchAll(/\[windows-preview\] status:\s*([A-Z_]+)/g)];
  return matches.at(-1)?.[1] ?? null;
}

export function defaultWindowsPreviewRunner({ cwd = REPO_ROOT, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'windows:preview'], {
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
  runWindowsPreview = defaultWindowsPreviewRunner,
  collectDiagnostics = collectPreviewDiagnostics,
  maxAttempts = 2
} = {}) {
  let previewResult = null;
  let previewStatus = null;
  let attemptCount = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptCount = attempt;
    previewResult = await runWindowsPreview({ cwd, env });
    previewStatus = extractWindowsPreviewStatus(previewResult.stdout);
    if (previewResult.code === 0 && SUCCESS_PREVIEW_STATUSES.has(previewStatus ?? '')) {
      break;
    }
    if (!(previewResult.code === 0 && RETRYABLE_PREVIEW_STATUSES.has(previewStatus ?? '') && attempt < maxAttempts)) {
      break;
    }
  }

  const diagnosticsNeeded = previewResult?.code !== 0 || !SUCCESS_PREVIEW_STATUSES.has(previewStatus ?? '');
  const diagnostics = diagnosticsNeeded ? await collectDiagnostics({ cwd, env }) : null;

  return {
    ...previewResult,
    attemptCount,
    diagnostics,
    executed: true,
    exitCode: previewResult?.code === 0 && SUCCESS_PREVIEW_STATUSES.has(previewStatus ?? '') ? 0 : 1,
    previewStatus,
    status: previewResult?.code === 0 && SUCCESS_PREVIEW_STATUSES.has(previewStatus ?? '') ? 'EXECUTED' : 'FAILED'
  };
}

async function main() {
  const result = await runTaskFinish();
  process.stdout.write(
    `[task-finish] windows preview ${result.status.toLowerCase()}: ${
      result.previewStatus ?? 'status-unavailable'
    }\n`
  );
  if (result.diagnostics) {
    process.stdout.write(`${formatPreviewDiagnostics(result.diagnostics)}\n`);
  }
  process.exit(result.exitCode);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main();
}
