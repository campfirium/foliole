import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveWindowsDiagnosticLogDir } from '../diagnostics/windowsDiagnosticPaths.js';

const BOOT_EVENT_LOG = path.join('logs', 'windows', 'native-boot-events.ndjson');
const READY_MARKER_FILE = '.windows-native-boot-ready.json';
const BRIDGE_READY_MARKER_FILE = '.windows-native-bridge-ready.json';
type BootEventSource = 'main' | 'renderer';

function resolveRepoRoot() {
  const envRoot = process.env.FOLIOLE_WORKDIR;
  if (envRoot) {
    return envRoot;
  }
  return process.cwd();
}

async function appendJsonLine(filePath: string, payload: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function writeJson(filePath: string, payload: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function createBootEvent(stage: string, payload: unknown, source: BootEventSource) {
  return {
    head: process.env.FOLIOLE_RUNTIME_HEAD ?? null,
    payload,
    pid: process.pid,
    session: process.env.FOLIOLE_BOOT_SESSION ?? null,
    source,
    stage,
    timestamp: new Date().toISOString()
  };
}

export function resolveBootArtifactPaths(repoRoot?: string) {
  const markerRoot = repoRoot ?? resolveRepoRoot();
  const logDir = repoRoot ? path.join(repoRoot, 'logs', 'windows') : resolveWindowsDiagnosticLogDir();
  return {
    bridgeReadyMarkerPath: path.join(markerRoot, BRIDGE_READY_MARKER_FILE),
    eventLogPath: path.join(logDir, path.basename(BOOT_EVENT_LOG)),
    readyMarkerPath: path.join(markerRoot, READY_MARKER_FILE),
    repoRoot: markerRoot
  };
}

async function persistBootEvent(event: ReturnType<typeof createBootEvent>) {
  const paths = resolveBootArtifactPaths();
  console.info('[boot-report]', {
    eventLogPath: paths.eventLogPath,
    pid: event.pid,
    readyMarkerPath: paths.readyMarkerPath,
    repoRoot: paths.repoRoot,
    source: event.source,
    stage: event.stage
  });
  await appendJsonLine(paths.eventLogPath, event);
  if (event.stage === 'app_ready') {
    await writeJson(paths.readyMarkerPath, event);
  }
  if (event.stage === 'bridge_ready') {
    await writeJson(paths.bridgeReadyMarkerPath, event);
  }
}

export async function appendBootEvent(stage: string, payload: unknown = null, source: BootEventSource = 'main') {
  await persistBootEvent(createBootEvent(stage, payload, source));
}

export async function bootReport(stage: string, payload: unknown = null) {
  await persistBootEvent(createBootEvent(stage, payload, 'renderer'));
}
