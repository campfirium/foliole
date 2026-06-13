#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOG_ROOT = path.join('.tmp', 'logs', 'quality-gate');
const FINAL_CONFIRMATION = 'npm run quality:release:base';
const RERUN_PREFIX = [
  'node',
  'scripts/run-vitest-with-summary.mjs',
  '.tmp/vitest/rerun.json',
  '--',
  '--silent=passed-only',
  '--pool=threads',
  '--maxWorkers=2',
  '--no-file-parallelism'
];

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@+-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseArgs(argv) {
  const args = { logRoot: process.env.QUALITY_GATE_LOG_ROOT || DEFAULT_LOG_ROOT, mode: 'plan', runDir: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--run') {
      args.mode = 'run';
    } else if (arg === '--run-dir') {
      args.runDir = argv[++index] ?? '';
    } else if (arg === '--log-root') {
      args.logRoot = argv[++index] ?? '';
    } else if (arg === '--help' || arg === '-h') {
      args.mode = 'help';
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

export function resolveLatestFailedRunDir(logRoot = DEFAULT_LOG_ROOT) {
  if (!existsSync(logRoot)) {
    return '';
  }
  const runDirs = readdirSync(logRoot)
    .map((entry) => path.join(logRoot, entry))
    .filter((entryPath) => statSync(entryPath).isDirectory())
    .sort((left, right) => path.basename(right).localeCompare(path.basename(left)));

  return runDirs.find((runDir) => {
    const failedPath = path.join(runDir, 'failed.txt');
    return existsSync(failedPath) && statSync(failedPath).size > 0;
  }) ?? '';
}

export function parseFailureSummary(text) {
  return text
    .split(/\n\s*\n/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => parseFailureBlock(block))
    .filter((entry) => entry.script || entry.rerun || entry.failedTests.length > 0);
}

function parseFailureBlock(block) {
  const entry = { display: '', failedTests: [], log: '', rerun: '', script: '' };
  for (const line of block.split(/\r?\n/u)) {
    const match = line.match(/^([^=]+)=(.*)$/u);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    if (key === 'failed-test') {
      entry.failedTests.push(value);
    } else if (key in entry) {
      entry[key] = value;
    }
  }
  return entry;
}

export function buildRepairCommand(entry) {
  if (entry.failedTests.length > 0) {
    return [...RERUN_PREFIX, ...entry.failedTests].map(shellQuote).join(' ');
  }
  return entry.rerun;
}

export function buildRepairPlan({ logRoot = DEFAULT_LOG_ROOT, runDir = '' } = {}) {
  const selectedRunDir = runDir || resolveLatestFailedRunDir(logRoot);
  if (!selectedRunDir) {
    return { entries: [], failedPath: '', runDir: '' };
  }
  const failedPath = path.join(selectedRunDir, 'failed.txt');
  const entries = dedupeEntriesByCommand(
    parseFailureSummary(readFileSync(failedPath, 'utf8')).map((entry) => ({
      ...entry,
      command: buildRepairCommand(entry),
      fallback: entry.failedTests.length > 0 && entry.script ? `npm run ${entry.script}` : ''
    }))
  );
  return { entries, failedPath, runDir: selectedRunDir };
}

function dedupeEntriesByCommand(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry.command || seen.has(entry.command)) {
      return false;
    }
    seen.add(entry.command);
    return true;
  });
}

export function formatRepairPlan(plan) {
  const lines = ['[quality-gate-repair] release repair plan'];
  if (!plan.runDir || plan.entries.length === 0) {
    lines.push('[quality-gate-repair] no failed quality gate summary found.');
    return lines.join('\n');
  }
  lines.push(`[quality-gate-repair] run-dir: ${plan.runDir}`);
  lines.push(`[quality-gate-repair] failed-summary: ${plan.failedPath}`);
  lines.push(`[quality-gate-repair] failures: ${plan.entries.length}`);
  for (const [index, entry] of plan.entries.entries()) {
    lines.push(`${index + 1}. ${entry.script || entry.display || '(unknown script)'}`);
    if (entry.failedTests.length > 0) {
      lines.push(`   failed-tests: ${entry.failedTests.join(', ')}`);
    }
    lines.push(`   repair: ${entry.command}`);
    if (entry.fallback) {
      lines.push(`   fallback: ${entry.fallback}`);
    }
  }
  lines.push('[quality-gate-repair] dry run only. To execute: npm run quality:release:repair:run');
  lines.push(`[quality-gate-repair] final confirmation after repairs: ${FINAL_CONFIRMATION}`);
  return lines.join('\n');
}

export async function runRepairPlan(plan, executor = runBashCommand) {
  let failed = false;
  for (const entry of plan.entries) {
    console.log(`[quality-gate-repair] running: ${entry.command}`);
    const code = await executor(entry.command);
    if (code !== 0) {
      failed = true;
      console.log(`[quality-gate-repair] failed: ${entry.script || entry.command}`);
      if (entry.fallback) {
        console.log(`[quality-gate-repair] fallback bucket: ${entry.fallback}`);
      }
    }
  }
  console.log(`[quality-gate-repair] final confirmation required: ${FINAL_CONFIRMATION}`);
  return failed ? 1 : 0;
}

function runBashCommand(command) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], { stdio: 'inherit' });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.mode === 'help') {
    console.log('Usage: node scripts/quality-gate-repair.mjs [--run] [--run-dir <dir>] [--log-root <dir>]');
    return 0;
  }
  const plan = buildRepairPlan({ logRoot: args.logRoot, runDir: args.runDir });
  console.log(formatRepairPlan(plan));
  if (!plan.runDir || plan.entries.length === 0) {
    return 1;
  }
  if (args.mode !== 'run') {
    return 0;
  }
  return runRepairPlan(plan);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[quality-gate-repair] ${error.message}`);
      process.exitCode = 1;
    });
}
