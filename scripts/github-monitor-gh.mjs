/* global process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const GH_EXECUTABLE = resolveGhExecutable();

function isExecutableFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveGhExecutable() {
  if (process.env.GH_PATH && isExecutableFile(process.env.GH_PATH)) {
    return process.env.GH_PATH;
  }
  const commandNames = process.platform === 'win32' ? ['gh.exe', 'gh.cmd', 'gh'] : ['gh'];
  for (const pathEntry of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!pathEntry) continue;
    for (const commandName of commandNames) {
      const candidate = path.join(pathEntry, commandName);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  if (process.platform === 'win32') {
    const fallbackPaths = [
      'C:\\Program Files\\GitHub CLI\\gh.exe',
      'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
      path.join(os.homedir(), 'scoop', 'shims', 'gh.exe')
    ];
    const fallback = fallbackPaths.find(isExecutableFile);
    if (fallback) return fallback;
  }
  return commandNames[0];
}

export const DEFAULT_GH_TIMEOUT_MS = Number(process.env.GITHUB_MONITOR_GH_TIMEOUT_MS || 120000);

export function formatGhFailure(command, args, result, timeoutMs) {
  const detail = (result.stderr || result.stdout || '').trim();
  const parts = [`${command} ${args.join(' ')} failed`];
  if (result.status !== null && result.status !== undefined) parts.push(`status=${result.status}`);
  if (result.signal) parts.push(`signal=${result.signal}`);
  if (result.error) parts.push(`error=${result.error.message || result.error}`);
  if (timeoutMs) parts.push(`timeoutMs=${timeoutMs}`);
  if (detail) parts.push(detail);
  return parts.join(': ');
}

export function runGh(args, { cwd = process.cwd(), timeoutMs = DEFAULT_GH_TIMEOUT_MS } = {}) {
  const result = spawnSync(GH_EXECUTABLE, args, { cwd, encoding: 'utf8', timeout: timeoutMs });
  if (result.status !== 0 || result.error) {
    throw new Error(formatGhFailure(GH_EXECUTABLE, args, result, timeoutMs));
  }
  return JSON.parse(result.stdout || 'null');
}

export function recordMonitorError(errors, source, detail, error) {
  errors.push({
    source,
    detail,
    message: error instanceof Error ? error.message : String(error)
  });
}

export function getPrCheckSignal(config, checks) {
  const failingNames = checks
    .filter((check) => config.failureBuckets.includes(check.bucket))
    .map((check) => check.name)
    .sort();
  if (failingNames.length) return { eventSuffix: failingNames.join('|'), label: failingNames.join(', ') };
  if (config.includeNoChecks && checks.length === 0) return { eventSuffix: 'no-checks', label: 'No checks reported' };
  return { eventSuffix: '', label: '' };
}

export function isNoChecksError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('no checks reported');
}

export function listPrChecks(config, pr) {
  try {
    return runGh(['pr', 'checks', String(pr.number), '--repo', config.repository, '--json', 'name,state,bucket,workflow,link,description']);
  } catch (error) {
    if (config.includeNoChecks && isNoChecksError(error)) return [];
    throw error;
  }
}
