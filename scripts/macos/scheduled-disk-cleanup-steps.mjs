/* global process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  REGISTERED_ARTIFACT_CATEGORIES,
  TASK_OWNED_ARTIFACT_CATEGORIES
} from '../diagnostics/local-artifact-cache-retention.mjs';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const RECENT_WRITE_MS = DAY_MS;
export const UNOWNED_IDLE_MS = 14 * DAY_MS;
export const QUARANTINE_HOLD_MS = 14 * DAY_MS;
export const TASK_CAP_BYTES = 5 * 1024 ** 3;
const OWNER_PATTERN = /^([ST]\d+(?:-\d+)?)(?:[A-Z]{1,2})?(?=$|[-_.])/iu;
const SENSITIVE_PATTERN = /backup|credential|secret|keystore/iu;
const CODE_REFERENCE = String.raw`artifacts['"]?[,/] *['"]?[A-Za-z0-9._-]+`;
const TOKEN_PATTERN = /^([A-Za-z]+\d+(?:-\d+)*)/u;
const ID_PATTERN = /^[A-Z]+\d+(?:-\d+)*$/u;
const REFERENCE_PATTERN = /\.tmp\/artifacts\/([^/\s`"')\]}>,;]+)/gu;
const NEVER_TOUCHED = new Set(['local-cleanup', ...REGISTERED_ARTIFACT_CATEGORIES, ...TASK_OWNED_ARTIFACT_CATEGORIES]);

export function artifactOwner(name) {
  return OWNER_PATTERN.exec(name)?.[1].toUpperCase() ?? null;
}

function ledgerRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n').map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 4 && ID_PATTERN.test(cells[1]));
}

// Open tasks and trials, plus every artifact folder an active plan names, protect artifacts.
export function readLedgerContext(repoRoot) {
  const atlas = path.join(repoRoot, '.lab/atlas');
  const openIds = new Set([
    ...ledgerRows(path.join(atlas, '0active/00-tasks-open.md')),
    ...ledgerRows(path.join(atlas, '0active/00-trials-open.md'))
  ].map((cells) => cells[1]));
  const closedIds = new Set(ledgerRows(path.join(atlas, '0active/01-tasks-closed.md'))
    .filter((cells) => ['完成', '废弃'].includes(cells[3])).map((cells) => cells[1]));
  const referenced = new Set();
  for (const folder of ['0active', '1planned', '2later']) {
    const directory = path.join(atlas, folder);
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith('.md'))) {
      for (const match of fs.readFileSync(path.join(directory, name), 'utf8').matchAll(REFERENCE_PATTERN)) {
        referenced.add(match[1].toLowerCase());
      }
    }
  }
  return { closedIds, openIds, referenced };
}

// Fixed artifact folder names that tracked code writes or reads stay in place.
export function readCodeReferences(repoRoot, run = spawnSync) {
  const result = run('git', ['-C', repoRoot, 'grep', '-hoE', CODE_REFERENCE, '--', 'scripts', 'src', 'electron'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 && result.status !== 1) throw new Error(`git grep failed: ${String(result.stderr).trim()}`);
  return new Set(String(result.stdout).split('\n').map((line) => /[A-Za-z0-9._-]+$/u.exec(line)?.[0].toLowerCase())
    .filter(Boolean));
}

// Stops as soon as the answer is known: a write after cutoffMs or Git metadata keeps the entry.
export function scanTree(entryPath, cutoffMs) {
  const stats = fs.lstatSync(entryPath);
  if (stats.mtimeMs > cutoffMs) return { git: false, recent: true };
  if (!stats.isDirectory()) return { git: false, recent: false };
  let names;
  try { names = fs.readdirSync(entryPath); } catch { return { git: false, recent: true }; }
  for (const name of names) {
    if (name === '.git') return { git: true, recent: false };
    const child = scanTree(path.join(entryPath, name), cutoffMs);
    if (child.git || child.recent) return child;
  }
  return { git: false, recent: false };
}

export function classifyArtifacts({ artifactsRoot, codeReferences = new Set(), ledger, nowMs }) {
  const result = { kept: [], owned: [], quarantine: [] };
  if (!fs.existsSync(artifactsRoot)) return result;
  for (const name of fs.readdirSync(artifactsRoot).sort()) {
    if (name.startsWith('.') || NEVER_TOUCHED.has(name)) continue;
    const entryPath = path.join(artifactsRoot, name);
    const owner = artifactOwner(name);
    if (owner) {
      const status = ledger.openIds.has(owner) ? 'open' : ledger.closedIds.has(owner) ? 'closed' : 'unknown';
      result.owned.push({ name, owner, path: entryPath, status });
      continue;
    }
    const token = TOKEN_PATTERN.exec(name)?.[1].toUpperCase();
    let reason = null;
    if (fs.lstatSync(entryPath).isSymbolicLink()) reason = 'symlink';
    else if (codeReferences.has(name.toLowerCase())) reason = 'fixed path used by repository code';
    else if (SENSITIVE_PATTERN.test(name)) reason = 'looks like a backup or credential';
    else if (ledger.referenced.has(name.toLowerCase()) || (token && ledger.openIds.has(token))) {
      reason = 'referenced by an open task or trial';
    } else {
      const scan = scanTree(entryPath, nowMs - UNOWNED_IDLE_MS);
      if (scan.git) reason = 'contains a Git checkout';
      else if (scan.recent) reason = 'written within 14 days';
    }
    (reason ? result.kept : result.quarantine).push({ name, path: entryPath, ...(reason ? { reason } : {}) });
  }
  return result;
}

// Allocated kilobytes via du, chunked to stay under the argument limit.
export function diskUsageBytes(paths, run = spawnSync) {
  const sizes = new Map();
  for (let index = 0; index < paths.length; index += 200) {
    const chunk = paths.slice(index, index + 200);
    const output = run('du', ['-sk', ...chunk], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? '';
    for (const line of output.split('\n')) {
      const tab = line.indexOf('\t');
      if (tab > 0) sizes.set(line.slice(tab + 1), Number(line.slice(0, tab)) * 1024);
    }
  }
  return sizes;
}

export function dayStamp(nowMs) {
  const date = new Date(nowMs);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function stampMs(stamp) {
  const match = /^(\d{4})(\d{2})(\d{2})$/u.exec(stamp);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() : null;
}

export function quarantineEntries({ apply, entries, nowMs, quarantineRoot, sizes }) {
  const target = path.join(quarantineRoot, dayStamp(nowMs));
  const moved = [];
  for (const entry of entries) {
    const scan = scanTree(entry.path, nowMs - UNOWNED_IDLE_MS);
    if (scan.git || scan.recent) continue;
    let destination = path.join(target, entry.name);
    for (let suffix = 2; fs.existsSync(destination); suffix += 1) destination = path.join(target, `${entry.name}-${suffix}`);
    const record = { bytes: sizes.get(entry.path) ?? 0, from: entry.path, to: destination };
    if (apply) {
      fs.mkdirSync(target, { recursive: true });
      fs.renameSync(entry.path, destination);
      fs.appendFileSync(path.join(target, 'manifest.jsonl'), `${JSON.stringify({ ...record, movedAt: new Date(nowMs).toISOString() })}\n`);
    }
    moved.push(record);
  }
  return moved;
}

export function purgeQuarantine({ apply, nowMs, quarantineRoot, run = spawnSync }) {
  if (!fs.existsSync(quarantineRoot)) return [];
  const expired = fs.readdirSync(quarantineRoot)
    .filter((name) => stampMs(name) !== null && nowMs - stampMs(name) >= QUARANTINE_HOLD_MS)
    .map((name) => path.join(quarantineRoot, name));
  const sizes = diskUsageBytes(expired, run);
  return expired.map((entryPath) => {
    if (apply) fs.rmSync(entryPath, { force: true, recursive: true });
    return { bytes: sizes.get(entryPath) ?? 0, path: entryPath };
  });
}

export function tasksOverCap(owned, sizes) {
  const totals = new Map();
  for (const entry of owned) {
    totals.set(entry.owner, (totals.get(entry.owner) ?? 0) + (sizes.get(entry.path) ?? 0));
  }
  return [...totals].filter(([, bytes]) => bytes > TASK_CAP_BYTES)
    .map(([task, bytes]) => ({ bytes, task })).sort((left, right) => right.bytes - left.bytes);
}

function parseLastJson(output) {
  const start = output.lastIndexOf('\n{');
  return JSON.parse(output.slice(start < 0 ? output.indexOf('{') : start + 1));
}

// Delegates closed-task removal to its owner; tasks with a write in the last 24 hours wait a round.
export function closedTaskStep({ apply, helper, interpreter = 'python3', nowMs, run = spawnSync, sleep }) {
  if (!fs.existsSync(helper)) return { status: 'skipped', reason: `helper missing: ${helper}` };
  const call = (args) => {
    const result = run(interpreter, [helper, ...args], { encoding: 'utf8', env: process.env });
    if (result.status !== 0) throw new Error(String(result.stderr || result.stdout).trim().split('\n').at(-1));
    return parseLastJson(result.stdout);
  };
  const preview = call([]);
  const candidates = JSON.parse(fs.readFileSync(preview.report, 'utf8')).candidates;
  const recent = new Set(candidates.filter((entry) => entry.newest_mtime * 1000 > nowMs - RECENT_WRITE_MS)
    .map((entry) => entry.task));
  const tasks = [...new Set(candidates.map((entry) => entry.task))].sort();
  const eligible = tasks.filter((task) => !recent.has(task));
  const outcome = { eligible, previewReport: preview.report, removed: [], skippedRecent: [...recent].sort(), status: 'complete' };
  if (!apply) return outcome;
  for (const task of eligible) {
    sleep(1100); // the helper names its report folder by the second
    try {
      const applied = call(['--task', task, '--apply']);
      outcome.removed.push({ bytes: Math.round(applied.removed_gib * 1024 ** 3), report: applied.report, task });
    } catch (error) {
      return { ...outcome, error: error.message, status: 'failed' };
    }
  }
  return outcome;
}
