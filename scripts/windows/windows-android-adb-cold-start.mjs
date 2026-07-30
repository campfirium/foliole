#!/usr/bin/env node
/* global console, process */

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseAdbDevicesLong, normalizeHostSnapshot, redactDiagnosticText } from './windows-android-dev-diagnostics-core.mjs';
import { resolveDiagnosticRepoRoot } from './windows-android-dev-diagnostics.mjs';

export const COLD_START_PORTS = [5037, 5601];
export const EXPECTED_ADB_PATH = 'C:\\Users\\zephu\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
export const EXPECTED_ADB_SHA256 = '957e46b8615f7af5b7292a2ddabe98d2e61940c3fb2b0545756507f080613e71';
export const EXPECTED_A5_SERIAL = '87a33a4b';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');

function normalizedPath(value) {
  return String(value || '').replaceAll('/', '\\').toLowerCase();
}

export function parseColdStartArgs(argv) {
  if (argv.length === 0) return { apply: false };
  if (argv.length === 1 && argv[0] === '--apply') return { apply: true };
  throw new Error('cold-start probe accepts only --apply; omit it for dry-run');
}

function matchingOwner(snapshot, listener) {
  const owner = snapshot.adbProcesses.find((item) => item.processId === listener.owningProcess);
  if (!owner) throw new Error(`ADB listener owner ${listener.owningProcess} could not be resolved`);
  if (normalizedPath(owner.imagePath) !== normalizedPath(EXPECTED_ADB_PATH)) {
    throw new Error(`ADB listener ${listener.localPort} image path mismatch`);
  }
  if (owner.imageSha256?.toLowerCase() !== EXPECTED_ADB_SHA256) {
    throw new Error(`ADB listener ${listener.localPort} image hash mismatch`);
  }
  return owner;
}

export function validateColdStartSnapshot(snapshot, { requireA5 = false } = {}) {
  if (normalizedPath(snapshot.adbClient.imagePath) !== normalizedPath(EXPECTED_ADB_PATH)) {
    throw new Error('ADB client path differs from the Task 1 verified image');
  }
  if (snapshot.adbClient.imageSha256?.toLowerCase() !== EXPECTED_ADB_SHA256) {
    throw new Error('ADB client hash differs from the Task 1 verified image');
  }
  if (snapshot.scheduledTask?.state?.toLowerCase() === 'running') {
    throw new Error('legacy A5 scheduled task is still running');
  }
  if (requireA5) {
    const pnpReady = snapshot.pnpDevices.some((item) => item.status === 'OK'
      && item.instanceId?.toLowerCase().endsWith(`\\${EXPECTED_A5_SERIAL}`));
    if (!pnpReady) throw new Error('configured A5 USB identity is not PnP-ready');
  }
  return Object.fromEntries(COLD_START_PORTS.map((port) => {
    const listeners = snapshot.listeners.filter((item) => item.localPort === port);
    const owners = new Set(listeners.map((item) => item.owningProcess));
    if (owners.size > 1) throw new Error(`ADB port ${port} has multiple listener owners`);
    for (const listener of listeners) matchingOwner(snapshot, listener);
    return [port, listeners];
  }));
}

function checked(record, label) {
  if (record.exitCode !== 0) throw new Error(`${label} failed with exit ${record.exitCode}`);
  return record;
}

function evidenceMarker(snapshot) {
  return snapshot.oldRuntime.entries.find((item) => item.name === 'evidence')?.lastWriteTimeUtc ?? null;
}

function visibleA5(record) {
  return parseDevicesCommand(record.stdout).some((item) =>
    item.serial === EXPECTED_A5_SERIAL && item.state === 'device');
}

function parseDevicesCommand(stdout) {
  const payload = String(stdout || '').split(/\r?\n/u)
    .filter((line) => line.trim() !== 'List of devices attached').join('\n');
  return parseAdbDevicesLong(payload);
}

export function chooseAdbPort(results) {
  const visible = results.filter((item) => item.a5Visible).map((item) => item.port);
  if (visible.includes(5037)) return 5037;
  if (visible.includes(5601)) return 5601;
  return null;
}

function requireNoListeners(snapshot) {
  const listeners = validateColdStartSnapshot(snapshot);
  if (COLD_START_PORTS.some((port) => listeners[port].length > 0)) {
    throw new Error('known ADB listeners remain after exact stop');
  }
}

function stopKnown(snapshot, runAdb, timeline) {
  const listeners = validateColdStartSnapshot(snapshot);
  for (const port of COLD_START_PORTS) {
    if (listeners[port].length === 1) {
      timeline.push({ command: checked(runAdb(['-P', String(port), 'kill-server']), `stop ${port}`), stage: 'stop-known' });
    }
  }
}

function probePort(port, snapshot, runAdb, timeline) {
  const before = snapshot();
  requireNoListeners(before);
  timeline.push({ command: checked(runAdb(['-P', String(port), 'start-server']), `start ${port}`), port, stage: 'start' });
  const started = snapshot();
  const listeners = validateColdStartSnapshot(started);
  if (listeners[port].length !== 1) throw new Error(`ADB port ${port} did not start one verified listener`);
  const devices = checked(runAdb(['-P', String(port), 'devices', '-l']), `devices ${port}`);
  const getState = runAdb(['-P', String(port), '-s', EXPECTED_A5_SERIAL, 'get-state']);
  const after = snapshot();
  validateColdStartSnapshot(after);
  timeline.push({ after, before, devices, getState, port, stage: 'probe', started });
  timeline.push({ command: checked(runAdb(['-P', String(port), 'kill-server']), `stop ${port}`), port, stage: 'stop' });
  const stopped = snapshot();
  requireNoListeners(stopped);
  timeline.push({ port, stage: 'stopped', stopped });
  return {
    a5Visible: visibleA5(devices) && getState.exitCode === 0 && getState.stdout.trim() === 'device',
    getState, port, transports: parseDevicesCommand(devices.stdout)
  };
}

export function runColdStartExperiment({ apply, runAdb, snapshot }) {
  const initial = snapshot();
  const initialListeners = validateColdStartSnapshot(initial, { requireA5: true });
  const timeline = [{ initial, stage: 'initial' }];
  if (!apply) return { apply, initialListeners, resultStatus: 'dry-run', timeline };
  try {
    stopKnown(initial, runAdb, timeline);
    const fresh = snapshot();
    requireNoListeners(fresh);
    timeline.push({ fresh, stage: 'all-stopped' });
    const results = COLD_START_PORTS.map((port) => probePort(port, snapshot, runAdb, timeline));
    const selectedPort = chooseAdbPort(results);
    if (selectedPort) {
      timeline.push({ command: checked(runAdb(['-P', String(selectedPort), 'start-server']), `final start ${selectedPort}`), stage: 'final-start' });
      const devices = checked(runAdb(['-P', String(selectedPort), 'devices', '-l']), 'final devices');
      const state = checked(runAdb(['-P', String(selectedPort), '-s', EXPECTED_A5_SERIAL, 'get-state']), 'final get-state');
      if (!visibleA5(devices) || state.stdout.trim() !== 'device') throw new Error('selected ADB route did not retain A5');
    }
    const final = snapshot();
    const finalListeners = validateColdStartSnapshot(final);
    for (const port of COLD_START_PORTS) {
      const expected = port === selectedPort ? 1 : 0;
      if (finalListeners[port].length !== expected) throw new Error('final ADB listener set is not singular');
    }
    if (evidenceMarker(initial) !== evidenceMarker(final)) throw new Error('legacy A5 evidence changed during cold-start probe');
    return { apply, final, resultStatus: selectedPort ? 'selected' : 'ssh-adb-usb-unavailable', results, selectedPort, timeline };
  } catch (error) {
    try { stopKnown(snapshot(), runAdb, timeline); } catch (cleanupError) {
      timeline.push({ message: cleanupError.message, stage: 'cleanup-failed' });
    }
    error.timeline = timeline;
    throw error;
  }
}

function runSnapshot(repoRoot) {
  const script = path.join(repoRoot, 'scripts', 'windows', 'windows-android-dev-diagnostics.ps1');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-RepoRoot', repoRoot, '-SessionProcessId', String(process.pid)],
  { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, shell: false, timeout: 30_000, windowsHide: true });
  if (result.status !== 0) throw new Error(redactDiagnosticText(result.stderr || result.stdout || 'snapshot failed'));
  return normalizeHostSnapshot(JSON.parse(result.stdout));
}

function adbCommand(args) {
  const result = spawnSync(EXPECTED_ADB_PATH, args, { encoding: 'utf8', shell: false, timeout: 15_000, windowsHide: true });
  return { args, exitCode: result.status ?? 125, stderr: redactDiagnosticText(result.stderr), stdout: redactDiagnosticText(result.stdout) };
}

function writeEvidence(repoRoot, summary) {
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/gu, '')}-${randomUUID().slice(0, 8)}`;
  const root = path.join(repoRoot, '.tmp', 'artifacts', 'windows-android-dev', runId);
  fs.mkdirSync(root, { recursive: true });
  const evidencePath = path.join(root, 'adb-cold-start-summary.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ ...summary, runId, schemaVersion: 1 }, null, 2)}\n`);
  return evidencePath;
}

export function main(argv = process.argv.slice(2)) {
  if (process.platform !== 'win32') throw new Error('cold-start probe requires Windows');
  const repo = resolveDiagnosticRepoRoot(SCRIPT_ROOT);
  const request = parseColdStartArgs(argv);
  let summary;
  try {
    summary = { ...runColdStartExperiment({ ...request, runAdb: adbCommand, snapshot: () => runSnapshot(repo.repoRoot) }), repo };
  } catch (error) {
    summary = { apply: request.apply, message: redactDiagnosticText(error.message), resultStatus: 'failure', timeline: error.timeline ?? [], repo };
  }
  const evidencePath = writeEvidence(repo.repoRoot, summary);
  console.log(`[windows-android-adb-cold-start] status=${summary.resultStatus} evidence=${evidencePath}`);
  return summary.resultStatus === 'failure' ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
