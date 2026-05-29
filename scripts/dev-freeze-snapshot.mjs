#!/usr/bin/env node
/* global console, process */

import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { summarizePreviewState } from './preview-dedupe-diagnostics.mjs';

const DEFAULT_RUNTIME_DIR = '.lab/internal/runtime';
const DEFAULT_WATCH_INTERVAL_MS = 20_000;
const DEFAULT_LOAD_THRESHOLD = 4;
const DEFAULT_DETAIL_COOLDOWN_MS = 120_000;
const PROCESS_PATTERN = /codex|git |npm |node|vitest|electron|windows-preview|preview-dedupe|with-resource-gate|sqlite|sed -n/u;

function runText(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? error.message}`.trim();
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function topProcesses() {
  return runText('ps', ['-eo', 'pid,ppid,stat,pcpu,pmem,etime,cmd', '--sort=-pcpu'])
    .split('\n')
    .slice(0, 26);
}

function matchingProcesses() {
  return runText('ps', ['-eo', 'pid,ppid,stat,pcpu,pmem,etime,cmd'])
    .split('\n')
    .filter((line, index) => index === 0 || PROCESS_PATTERN.test(line));
}

async function resourceLocks(runtimeDir) {
  let names = [];
  try {
    names = await readdir(runtimeDir);
  } catch {
    return [];
  }
  const lockNames = names.filter((name) => /^resource-gate\..+\.lock$/u.test(name));
  return Promise.all(lockNames.map(async (name) => ({
    name,
    content: await readJson(path.join(runtimeDir, name))
  })));
}

export async function buildFreezeSnapshot({ now = new Date(), runtimeDir = DEFAULT_RUNTIME_DIR } = {}) {
  const state = await readJson(path.join(runtimeDir, 'windows-preview.state.json'));
  return {
    createdAt: now.toISOString(),
    git: {
      diffStylesShortstat: runText('git', ['diff', '--shortstat', '--', 'src/app/styles.css']),
      statusShort: runText('git', ['status', '--short'])
    },
    memory: runText('free', ['-h']),
    preview: summarizePreviewState(state, now.getTime()),
    processes: {
      matching: matchingProcesses(),
      topCpu: topProcesses()
    },
    resourceLocks: await resourceLocks(runtimeDir),
    uptime: runText('uptime', [])
  };
}

function parseLoadAverage(text) {
  return text.split(/\s+/u).slice(0, 3).map(Number).filter(Number.isFinite);
}

async function readLoadAverage() {
  try {
    return parseLoadAverage(await readFile('/proc/loadavg', 'utf8'));
  } catch {
    const match = /load average:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/u.exec(runText('uptime', []));
    return match ? match.slice(1).map(Number) : [];
  }
}

async function readMemorySummary() {
  try {
    const text = await readFile('/proc/meminfo', 'utf8');
    const entries = Object.fromEntries(text.split('\n').map((line) => {
      const match = /^([^:]+):\s+(\d+)/u.exec(line);
      return match ? [match[1], Number(match[2])] : [];
    }).filter((entry) => entry.length === 2));
    return {
      availableKb: entries.MemAvailable ?? null,
      freeKb: entries.MemFree ?? null,
      totalKb: entries.MemTotal ?? null
    };
  } catch {
    return null;
  }
}

export async function buildLightSample({ now = new Date(), runtimeDir = DEFAULT_RUNTIME_DIR } = {}) {
  const [loadAverage, memory, locks] = await Promise.all([
    readLoadAverage(),
    readMemorySummary(),
    resourceLocks(runtimeDir)
  ]);
  return {
    createdAt: now.toISOString(),
    loadAverage,
    memory,
    processes: {
      matching: matchingProcesses(),
      topCpu: topProcesses().slice(0, 12)
    },
    resourceLocks: locks
  };
}

function numberEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shouldWriteDetail(sample, threshold) {
  return Number(sample.loadAverage?.[0] ?? 0) >= threshold;
}

function timestamp(date) {
  return date.toISOString().replaceAll(/[:.]/gu, '-');
}

async function writeSnapshot(runtimeDir, snapshot, prefix = 'freeze') {
  const outputDir = path.join(runtimeDir, 'freeze-snapshots');
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${prefix}-${timestamp(new Date(snapshot.createdAt))}.json`);
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function runOnce() {
  const now = new Date();
  const runtimeDir = process.env.FOLIOLE_FREEZE_RUNTIME_DIR ?? DEFAULT_RUNTIME_DIR;
  const snapshot = await buildFreezeSnapshot({ now, runtimeDir });
  const outputPath = await writeSnapshot(runtimeDir, snapshot);
  console.log(`[diag:freeze] wrote ${outputPath}`);
  console.log(JSON.stringify({
    load: snapshot.uptime,
    locks: snapshot.resourceLocks.length,
    matchingProcesses: snapshot.processes.matching.length - 1,
    path: outputPath
  }, null, 2));
}

async function runWatch() {
  const runtimeDir = process.env.FOLIOLE_FREEZE_RUNTIME_DIR ?? DEFAULT_RUNTIME_DIR;
  const intervalMs = numberEnv('FOLIOLE_FREEZE_INTERVAL_MS', DEFAULT_WATCH_INTERVAL_MS);
  const threshold = numberEnv('FOLIOLE_FREEZE_LOAD_THRESHOLD', DEFAULT_LOAD_THRESHOLD);
  const detailCooldownMs = numberEnv('FOLIOLE_FREEZE_DETAIL_COOLDOWN_MS', DEFAULT_DETAIL_COOLDOWN_MS);
  const logPath = path.join(runtimeDir, 'freeze-sampler.jsonl');
  const pidPath = path.join(runtimeDir, 'freeze-sampler.pid');
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(pidPath, `${process.pid}\n`, 'utf8');
  let lastDetailAt = 0;
  console.log(`[diag:freeze] watch interval=${intervalMs}ms threshold=${threshold} log=${logPath}`);
  try {
    while (true) {
      const sample = await buildLightSample({ runtimeDir });
      await appendFile(logPath, `${JSON.stringify(sample)}\n`, 'utf8');
      const now = Date.now();
      if (shouldWriteDetail(sample, threshold) && now - lastDetailAt >= detailCooldownMs) {
        lastDetailAt = now;
        const detail = await buildFreezeSnapshot({ now: new Date(), runtimeDir });
        await writeSnapshot(runtimeDir, detail, 'freeze-auto');
      }
      await delay(intervalMs);
    }
  } finally {
    await rm(pidPath, { force: true });
  }
}

async function stopWatch() {
  const runtimeDir = process.env.FOLIOLE_FREEZE_RUNTIME_DIR ?? DEFAULT_RUNTIME_DIR;
  const pidPath = path.join(runtimeDir, 'freeze-sampler.pid');
  const pid = Number((await readFile(pidPath, 'utf8')).trim());
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`invalid sampler pid in ${pidPath}`);
  }
  process.kill(pid, 'SIGTERM');
  console.log(`[diag:freeze] stopped pid=${pid}`);
}

async function main() {
  const [mode] = process.argv.slice(2);
  if (mode === '--watch') {
    await runWatch();
    return;
  }
  if (mode === '--stop') {
    await stopWatch();
    return;
  }
  await runOnce();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/dev-freeze-snapshot.mjs')) {
  await main().catch((error) => {
    console.error(`[diag:freeze] ${error.message}`);
    process.exitCode = 1;
  });
}
