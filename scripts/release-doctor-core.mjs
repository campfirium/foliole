/* global process */

import { spawnSync } from 'node:child_process';

export const STATUS_ORDER = ['FAIL', 'WARN', 'UNKNOWN', 'SKIPPED', 'PASS'];

const STATUS_LABELS = new Set(STATUS_ORDER);

export function parseArgs(argv = process.argv.slice(2)) {
  const phaseArg = argv.find((arg) => arg.startsWith('--phase='));
  const phase = phaseArg ? phaseArg.slice('--phase='.length) : 'pre';
  if (!['pre', 'post'].includes(phase)) {
    return { error: `invalid phase "${phase}"; expected pre or post`, phase };
  }
  return { phase };
}

export function createCheck(status, title, detail) {
  if (!STATUS_LABELS.has(status)) {
    throw new Error(`Unknown release doctor status: ${status}`);
  }
  return { detail, status, title };
}

function summarizeChecks(checks) {
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
  for (const check of checks) {
    counts[check.status] += 1;
  }
  return counts;
}

export function formatReleaseDoctorReport({ checks, phase, version }) {
  const counts = summarizeChecks(checks);
  const lines = [
    `[release-doctor] version=${version ?? '<unknown>'} phase=${phase}`,
    `[release-doctor] summary ${STATUS_ORDER.map((status) => `${status}=${counts[status]}`).join(' ')}`
  ];
  for (const check of checks) {
    lines.push(`[${check.status}] ${check.title}: ${check.detail}`);
  }
  return lines.join('\n');
}

export function hasFailures(checks) {
  return checks.some((check) => check.status === 'FAIL');
}

export function runCommand(command, args, rootDir) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    shell: false
  });
}
