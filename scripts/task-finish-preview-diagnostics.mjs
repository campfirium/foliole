/* global process */

import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_LOG_TAIL_LIMIT = 12;

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

  return diagnosticsByRoot.find(
    (entry) => entry.latestBootEvent || entry.latestRendererState || entry.bootReadyMarker || entry.bridgeReadyMarker
  ) ?? diagnosticsByRoot[0] ?? null;
}

export function formatPreviewDiagnostics(diagnostics) {
  if (!diagnostics) {
    return '[task-finish] preview diagnostics unavailable';
  }

  const lines = ['[task-finish] preview diagnostics'];
  lines.push(`latest boot stage: ${diagnostics.latestBootEvent?.stage ?? 'missing'}`);
  lines.push(`app-ready marker: ${diagnostics.bootReadyMarker?.stage ?? 'missing'}`);
  lines.push(`bridge-ready marker: ${diagnostics.bridgeReadyMarker?.stage ?? 'missing'}`);
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
