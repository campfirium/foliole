#!/usr/bin/env node
/* global process */

import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  finalizeTransportResults, normalizeHostSnapshot, parseAdbDevicesLong,
  planTransportProbes, redactDiagnosticText
} from './windows-android-dev-diagnostics-core.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');

function diagnosticError(message, exitCode, failureStage) {
  return Object.assign(new Error(message), { exitCode, failureStage });
}

function runGit(repoRoot, args, optional = false) {
  const result = spawnSync('git.exe', ['-C', repoRoot, ...args], {
    encoding: 'utf8', shell: false, timeout: 15_000, windowsHide: true
  });
  if (result.status !== 0 && !optional) {
    throw diagnosticError(redactDiagnosticText(result.stderr || `git ${args[0]} failed`), 64, 'repo');
  }
  return result.status === 0 ? result.stdout.trim() : null;
}

export function resolveDiagnosticRepoRoot(candidate = SCRIPT_ROOT) {
  const reported = runGit(candidate, ['rev-parse', '--show-toplevel']);
  const actual = fs.realpathSync.native(reported);
  const expected = fs.realpathSync.native(candidate);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw diagnosticError('script path and Git top-level do not identify the same repository', 64, 'repo');
  }
  return {
    branch: runGit(actual, ['branch', '--show-current']),
    head: runGit(actual, ['rev-parse', 'HEAD']),
    remoteNames: runGit(actual, ['remote']).split(/\r?\n/u).filter(Boolean),
    repoRoot: actual,
    statusShort: runGit(actual, ['status', '--short']).split(/\r?\n/u).filter(Boolean),
    upstream: runGit(actual, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], true)
  };
}

function runHostSnapshot(repoRoot) {
  const script = path.join(repoRoot, 'scripts', 'windows', 'windows-android-dev-diagnostics.ps1');
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-RepoRoot', repoRoot, '-SessionProcessId', String(process.pid)
  ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, shell: false, timeout: 30_000, windowsHide: true });
  if (result.status !== 0) {
    throw diagnosticError(redactDiagnosticText(result.stderr || result.stdout || 'host snapshot failed'), 74, 'host-snapshot');
  }
  try {
    return normalizeHostSnapshot(JSON.parse(result.stdout));
  } catch (error) {
    throw diagnosticError(`host snapshot JSON invalid: ${redactDiagnosticText(error.message)}`, 74, 'host-snapshot');
  }
}

function decodeAdbResponse(buffer) {
  if (buffer.length < 4) return null;
  const status = buffer.subarray(0, 4).toString('ascii');
  if (!['OKAY', 'FAIL'].includes(status)) throw new Error('ADB server returned an invalid response');
  if (buffer.length < 8) return null;
  const length = Number.parseInt(buffer.subarray(4, 8).toString('ascii'), 16);
  if (!Number.isSafeInteger(length) || length < 0) throw new Error('ADB server returned an invalid payload length');
  if (buffer.length < 8 + length) return null;
  const payload = buffer.subarray(8, 8 + length).toString('utf8');
  if (status === 'FAIL') throw new Error(`ADB server rejected devices-l: ${payload}`);
  return payload;
}

export function queryAdbDevicesLong(address, port, createConnection = net.createConnection) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const socket = createConnection({ host: address, port });
    const fail = (error) => { socket.destroy(); reject(error); };
    socket.setTimeout(5_000, () => fail(new Error('ADB server query timed out')));
    socket.on('connect', () => {
      const service = Buffer.from('host:devices-l', 'utf8');
      socket.write(Buffer.concat([Buffer.from(service.length.toString(16).padStart(4, '0')), service]));
    });
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      try {
        const payload = decodeAdbResponse(Buffer.concat(chunks));
        if (payload !== null) { socket.end(); resolve(payload); }
      } catch (error) { fail(error); }
    });
    socket.on('error', reject);
    socket.on('end', () => {
      try {
        const payload = decodeAdbResponse(Buffer.concat(chunks));
        if (payload === null) reject(new Error('ADB server closed before completing devices-l'));
      } catch (error) { reject(error); }
    });
  });
}

async function collectTransportResults(snapshot, query) {
  const plans = planTransportProbes(snapshot);
  const results = [];
  for (const plan of plans) {
    if (plan.status !== 'probe-ready') { results.push(plan); continue; }
    const transports = parseAdbDevicesLong(await query(plan.address, plan.port));
    results.push({ port: plan.port, status: transports.length > 0 ? 'present' : 'empty', transports });
  }
  return results;
}

function createEvidenceContext(repoRoot, now, id) {
  const runId = `${now().toISOString().replace(/[-:.TZ]/gu, '')}-${id().slice(0, 8)}`;
  const root = path.join(repoRoot, '.tmp', 'artifacts', 'windows-android-dev', runId);
  fs.mkdirSync(root, { recursive: true });
  return { logPath: path.join(root, 'diagnostic.log'), root, runId, summaryPath: path.join(root, 'summary.json') };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function successSummary(context, repo, before, after, transports, startedAt, now) {
  return {
    adbClient: before.adbClient, adbProcesses: before.adbProcesses, afterProbe: {
      adbProcesses: after.adbProcesses, capturedAt: after.capturedAt, listeners: after.listeners
    }, authorizedKeys: before.authorizedKeys, completedAt: now().toISOString(), listeners: before.listeners,
    oldRuntime: before.oldRuntime, pnpDevices: before.pnpDevices, repo, resultStatus: 'success',
    runId: context.runId, scheduledTask: before.scheduledTask, schemaVersion: 1, sshSession: before.sshSession,
    startedAt, transportsByPort: Object.fromEntries(transports.map((item) => [String(item.port), item]))
  };
}

export async function runWindowsAndroidDevDiagnostics({
  argv = process.argv.slice(2), id = randomUUID, now = () => new Date(), platform = process.platform,
  query = queryAdbDevicesLong, resolveRepo = resolveDiagnosticRepoRoot, snapshot = runHostSnapshot,
  stderr = process.stderr, stdout = process.stdout
} = {}) {
  let context = null;
  const startedAt = now().toISOString();
  try {
    if (platform !== 'win32' || argv.length > 0) throw diagnosticError('Windows diagnostic accepts no arguments', 64, 'request');
    const repo = resolveRepo();
    context = createEvidenceContext(repo.repoRoot, now, id);
    const before = snapshot(repo.repoRoot);
    const observed = await collectTransportResults(before, query);
    const after = snapshot(repo.repoRoot);
    const transports = finalizeTransportResults(before, after, observed);
    const summary = successSummary(context, repo, before, after, transports, startedAt, now);
    writeJson(context.summaryPath, summary);
    fs.writeFileSync(context.logPath, `snapshot-before=0\nadb-query=0\nsnapshot-after=0\nexit=0\n`, 'utf8');
    stdout.write(`[windows-android-dev-diagnostics] status: OK evidence=${context.summaryPath}\n`);
    return { evidencePath: context.summaryPath, exitCode: 0, summary };
  } catch (error) {
    const exitCode = error.exitCode || 125;
    const failure = { completedAt: now().toISOString(), exitCode, failureStage: error.failureStage || 'entry',
      message: redactDiagnosticText(error.message), resultStatus: 'failure', runId: context?.runId ?? null, schemaVersion: 1, startedAt };
    if (context) { writeJson(context.summaryPath, failure); fs.writeFileSync(context.logPath, `exit=${exitCode}\nstage=${failure.failureStage}\n`, 'utf8'); }
    stderr.write(`[windows-android-dev-diagnostics] status: FAILED stage=${failure.failureStage} exit=${exitCode}${context ? ` evidence=${context.summaryPath}` : ''}\n`);
    return { evidencePath: context?.summaryPath ?? null, exitCode, summary: failure };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runWindowsAndroidDevDiagnostics();
  process.exitCode = result.exitCode;
}
