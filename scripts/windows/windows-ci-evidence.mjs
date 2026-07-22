import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { WINDOWS_CI_PLAYWRIGHT_SPECS } from './windows-ci-playwright-profile.mjs';

const ALLOWED_OUTCOMES = new Set(['success', 'failure', 'skipped', 'cancelled']);
const STEP_KEYS = [
  'context',
  'npm_ci',
  'dependency_hardening',
  'native_abi',
  'desktop_build',
  'desktop_quality',
  'windows_core',
  'windows_tail',
  'playwright'
];

function requireValue(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function verifyWindowsCiContext({
  env = process.env,
  readHead = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} = {}) {
  const sha = requireValue(env, 'GITHUB_SHA');
  if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error('GITHUB_SHA must be a 40-character lowercase commit SHA');
  const head = readHead();
  if (head !== sha) throw new Error(`checked out HEAD does not match GITHUB_SHA: head=${head} sha=${sha}`);
  if (requireValue(env, 'RUNNER_OS') !== 'Windows') throw new Error('RUNNER_OS must be Windows');
  if (requireValue(env, 'RUNNER_ARCH') !== 'X64') throw new Error('RUNNER_ARCH must be X64');
  return { head, sha };
}

function inspectWindowsCiContext(options) {
  try {
    return { ...verifyWindowsCiContext(options), error: '', status: 'success' };
  } catch (error) {
    const env = options?.env ?? process.env;
    let head = '';
    try {
      head = options?.readHead?.() ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      head = 'unavailable';
    }
    return {
      error: error instanceof Error ? error.message : String(error),
      head,
      sha: env.GITHUB_SHA?.trim() || 'unavailable',
      status: 'failure'
    };
  }
}

function collectStepOutcomes(env) {
  return Object.fromEntries(STEP_KEYS.map((key) => {
    const envName = `${key.toUpperCase()}_OUTCOME`;
    const outcome = requireValue(env, envName);
    if (!ALLOWED_OUTCOMES.has(outcome)) throw new Error(`${envName} has invalid outcome: ${outcome}`);
    return [key, outcome];
  }));
}

function renderEvidence(context, env, outcomes) {
  const fields = {
    commit_sha: context.sha,
    checkout_head: context.head,
    context_status: context.status,
    context_error: context.error || 'none',
    event_name: requireValue(env, 'GITHUB_EVENT_NAME'),
    ref: requireValue(env, 'GITHUB_REF'),
    run_id: requireValue(env, 'GITHUB_RUN_ID'),
    run_attempt: requireValue(env, 'GITHUB_RUN_ATTEMPT'),
    runner_os: requireValue(env, 'RUNNER_OS'),
    runner_arch: requireValue(env, 'RUNNER_ARCH'),
    ci_suite: WINDOWS_CI_PLAYWRIGHT_SPECS.join(','),
    ...Object.fromEntries(Object.entries(outcomes).map(([key, value]) => [`step_${key}`, value]))
  };
  return `${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
}

export function writeWindowsCiEvidence({ env = process.env, fsApi = fs, readHead } = {}) {
  const context = inspectWindowsCiContext({ env, readHead });
  const evidence = renderEvidence(context, env, collectStepOutcomes(env));
  const evidenceDir = path.resolve('.tmp/artifacts/windows-ci-evidence');
  const safeSha = /^[0-9a-f]{40}$/u.test(context.sha) ? context.sha : 'unverified';
  const evidencePath = path.join(evidenceDir, `windows-x64-ci-${safeSha}.txt`);
  fsApi.mkdirSync(evidenceDir, { recursive: true });
  fsApi.writeFileSync(evidencePath, evidence, 'utf8');
  const summaryPath = env.GITHUB_STEP_SUMMARY?.trim();
  if (summaryPath) {
    fsApi.appendFileSync(summaryPath, `## Windows x64 CI\n\n\`\`\`text\n${evidence}\`\`\`\n`, 'utf8');
  }
  return { evidence, evidencePath };
}

function runCli(command) {
  if (command === 'verify') {
    const { sha } = verifyWindowsCiContext();
    process.stdout.write(`[windows-ci-evidence] context verified sha=${sha}\n`);
    return;
  }
  if (command === 'write') {
    const { evidencePath } = writeWindowsCiEvidence();
    process.stdout.write(`[windows-ci-evidence] wrote ${evidencePath}\n`);
    return;
  }
  throw new Error('Usage: node scripts/windows/windows-ci-evidence.mjs <verify|write>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    runCli(process.argv[2]);
  } catch (error) {
    process.stderr.write(`[windows-ci-evidence] ${error.message}\n`);
    process.exitCode = 1;
  }
}
