#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isLockStale, sharedGateRoot } from '../lib/resource-gate.mjs';
import { DAY_MS, dayStamp } from './scheduled-disk-cleanup-steps.mjs';
import { freedBytes, gib } from './scheduled-disk-cleanup-report.mjs';
import { cleanupConfig, freeBytes } from './scheduled-disk-cleanup.mjs';

export const UD_LOW_BYTES = 60 * 1024 ** 3;
export const INTERNAL_LOW_BYTES = 15 * 1024 ** 3;
const DAILY_AFTER_MINUTES = 4 * 60 + 30;
const LOW_SPACE_ROUND_GAP_MS = 6 * 60 * 60 * 1000;
const GATE_STALE_MS = 60 * 60 * 1000;
const ROUND_TIMEOUT_MS = 60 * 60 * 1000;
const LOG_MAX_BYTES = 5 * 1024 * 1024;

export function runtimeRoot(homeDirectory = os.homedir()) {
  return path.join(homeDirectory, '.codex/local-tools/foliole-disk-cleanup');
}

export function gateHolders(repoRoot) {
  const directory = path.join(sharedGateRoot(repoRoot), '.lab/internal/runtime');
  return ['node-heavy', 'preview', 'exclusive'].flatMap((resource) => {
    try {
      const lock = JSON.parse(fs.readFileSync(path.join(directory, `resource-gate.${resource}.lock`), 'utf8'));
      return isLockStale(lock, GATE_STALE_MS) ? [] : [`${resource}:${lock.className ?? 'unknown'}:${lock.pid}`];
    } catch {
      return [];
    }
  });
}

export function notify(message, run = spawnSync) {
  run('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title (item 2 of argv)',
    '-e', 'end run', message, 'Foliole 磁盘清理'], { encoding: 'utf8' });
}

function readState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; }
}

function isMounted(volume) {
  try { return fs.statSync(volume).dev !== fs.statSync(path.dirname(volume)).dev; } catch { return false; }
}

function launchRound(config, reasons) {
  const node = process.execPath;
  const result = spawnSync(node, [path.join(config.repoRoot, 'scripts/with-resource-gate.mjs'), 'exclusive', '--',
    node, path.join(config.repoRoot, 'scripts/macos/scheduled-disk-cleanup.mjs'), 'round', '--reason', reasons.join(',')], {
    cwd: config.repoRoot, encoding: 'utf8',
    env: { ...process.env, FOLIOLE_RESOURCE_GATE_COMMAND_TIMEOUT_MS: String(ROUND_TIMEOUT_MS) }
  });
  const summary = String(result.stdout).trim().split('\n').reverse().find((line) => line.startsWith('{"report"'));
  if (!summary) throw new Error(String(result.stderr || result.stdout).trim().split('\n').at(-1) || 'round produced no report');
  return JSON.parse(fs.readFileSync(JSON.parse(summary).report, 'utf8'));
}

// Hourly entry: cheap checks every time, a full round once a day or early when UD runs low.
export function runTick({
  config = cleanupConfig(), free = freeBytes, mounted = isMounted, nowMs = Date.now(), notifyUser = notify,
  holders = gateHolders, round = launchRound, statePath = path.join(runtimeRoot(), 'state.json')
} = {}) {
  const state = readState(statePath);
  state.notified ??= {};
  const once = (key, message, gapMs = DAY_MS) => {
    if (nowMs - (state.notified[key] ?? 0) < gapMs) return;
    state.notified[key] = nowMs;
    notifyUser(message);
  };
  const save = (outcome) => {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify({ ...state, lastTick: { at: new Date(nowMs).toISOString(), ...outcome } }, null, 2)}\n`);
    return outcome;
  };
  if (!mounted(config.udVolume)) {
    once('ud-missing', 'UD 未挂载，今天的自动清理没有运行。');
    return save({ action: 'ud-missing' });
  }
  const ud = free(config.udVolume);
  const internal = free(config.internalVolume);
  if (internal < INTERNAL_LOW_BYTES) once('internal-low', `内盘只剩 ${gib(internal)}，低于 ${gib(INTERNAL_LOW_BYTES)}，需要人工处理。`);
  const now = new Date(nowMs);
  const reasons = [];
  if (now.getHours() * 60 + now.getMinutes() >= DAILY_AFTER_MINUTES && state.lastRoundDay !== dayStamp(nowMs)) reasons.push('daily');
  if (ud < UD_LOW_BYTES && nowMs - (state.lastLowSpaceRoundAt ?? 0) >= LOW_SPACE_ROUND_GAP_MS) reasons.push('ud-low');
  if (reasons.length === 0) return save({ action: 'idle', free: { internal, ud } });
  const busy = [...holders(config.repoRoot), ...(fs.existsSync(config.a5LeasePath) ? ['a5-lease'] : [])];
  if (busy.length > 0) {
    state.deferredSince ??= nowMs;
    if (nowMs - state.deferredSince > DAY_MS) once('deferred', `自动清理已推迟超过 24 小时（占用：${busy.join('、')}）。`);
    return save({ action: 'deferred', busy, reasons });
  }
  state.deferredSince = null;
  let report;
  try {
    report = round(config, reasons);
  } catch (error) {
    once('round-failed', `自动清理没有完成：${error.message}`);
    return save({ action: 'failed', error: error.message, reasons });
  }
  if (report.status === 'complete') state.lastRoundDay = dayStamp(nowMs);
  if (reasons.includes('ud-low')) {
    state.lastLowSpaceRoundAt = nowMs;
    const after = report.free.after.ud;
    const top = (report.overCap ?? []).slice(0, 3).map((item) => `${item.task} ${gib(item.bytes)}`).join('、');
    once('ud-low', `UD 剩 ${gib(ud)}，已自动清出 ${gib(freedBytes(report))}，现剩 ${gib(after)}。`
      + (after < UD_LOW_BYTES ? `仍偏低，最大的任务目录：${top || '无'}。` : ''), LOW_SPACE_ROUND_GAP_MS);
  }
  const fresh = (report.overCap ?? []).filter((item) => !(state.overCapNotified ?? []).includes(item.task));
  if (fresh.length > 0) {
    notifyUser(`超过 5G 的任务目录：${fresh.slice(0, 3).map((item) => `${item.task} ${gib(item.bytes)}`).join('、')}。`);
  }
  state.overCapNotified = (report.overCap ?? []).map((item) => item.task);
  if (report.status !== 'complete') once('round-failed', `自动清理${report.status === 'interrupted' ? '中途停止' : '有步骤失败'}，见 ${report.reportPath}`);
  return save({ action: 'round', reasons, report: report.reportPath, status: report.status });
}

function trimLogs(directory) {
  for (const name of ['stdout.log', 'stderr.log']) {
    const filePath = path.join(directory, name);
    try { if (fs.statSync(filePath).size > LOG_MAX_BYTES) fs.truncateSync(filePath, 0); } catch { /* absent */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    trimLogs(path.join(runtimeRoot(), 'logs'));
    console.log(JSON.stringify({ at: new Date().toISOString(), ...runTick() }));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
