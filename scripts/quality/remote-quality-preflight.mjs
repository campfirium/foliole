/* global console, process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runRelatedTests } from './quality-fast-related-tests.mjs';
import {
  capturePreflight as capture, MAX_PREFLIGHT_TESTS, planPreflightSelection
} from './remote-quality-preflight-plan.mjs';
import {
  computePreflightFingerprint, PREFLIGHT_RECORD_FILE, preflightReuseMismatch,
  readPreflightRecord, writePreflightRecord
} from './remote-quality-preflight-reuse.mjs';

const RUN_TITLE_PATTERN = /^Dev Quality Check \((\w+)\) @ ([0-9a-f]{40})\b/u;

function runCaptured(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: 1, stderr: error.message, stdout }));
    child.on('exit', (code) => resolve({ code: code ?? 1, stderr, stdout }));
  });
}

export function baseFromRunTitle(title, scope) {
  const match = RUN_TITLE_PATTERN.exec(title ?? '');
  if (!match) return null;
  return match[1] === scope || match[1] === 'full' ? match[2] : null;
}

// The last green remote run covering this scope is the point where remote
// assertions and code were known to agree.
export async function resolvePreflightBase({ cwd, repo, runner, scope }) {
  const titles = JSON.parse(await capture(runner, 'gh', [
    'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repo}/actions/workflows/remote-quality.yml/runs?branch=dev&status=success&per_page=50`,
    '--jq', '[.workflow_runs[].display_title]'
  ], cwd));
  for (const title of titles) {
    const sha = baseFromRunTitle(title, scope);
    if (!sha) continue;
    const known = await runner('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd });
    if (known.code === 0) return sha;
  }
  throw new Error(`no local commit matches a recent green ${scope} remote run; pass --base <sha>`);
}

function formatEntry(entry) {
  const reasons = entry.reasons.map(({ reason, source }) => `${reason}:${source}`);
  return `  ${entry.file} <- ${[...new Set(reasons)].join(', ')}`;
}

export function preflightFailureMessage(files) {
  return [
    'remote preflight failed: local assertions no longer match the code since the last green remote run.',
    'For each failing test, decide first whether the assertion is stale (semantics changed on purpose)',
    'or the code regressed; update stale assertions to the new semantics, fix regressions in code.',
    'Do not just rewrite expectations to match current output. Rerun quality:remote afterwards.',
    `Checked ${files.length} related test file(s); use --skip-preflight only when the failure is local-only.`
  ].join('\n');
}

export async function runRemoteQualityPreflight(options) {
  const { cwd = process.cwd(), runner = runCaptured, log = console.log } = options;
  const base = options.base ?? await resolvePreflightBase({ ...options, cwd, runner });
  const head = options.head ?? 'HEAD';
  const { changedFiles, deferred, entries, estimatedSeconds, heavy = [], run } = await planPreflightSelection({
    base, cap: options.cap ?? MAX_PREFLIGHT_TESTS, cwd, head, readText: options.readText, runner
  });
  log(`[remote-preflight] ${changedFiles.length} changed file(s) since ${base.slice(0, 12)}; `
    + `${entries.length} related test file(s)`);
  if (options.list) {
    entries.forEach((entry) => log(formatEntry(entry)));
    return { base, deferred, run };
  }
  if (deferred.length > 0) {
    log(`[remote-preflight] ${deferred.length} test file(s) left to remote, ${heavy.length} of them known `
      + `heavy; running ${run.length} estimated at ${Math.round(estimatedSeconds ?? 0)}s (see --list)`);
  }
  if (run.length === 0) return { base, deferred, run };
  const files = run.map(({ file }) => file);
  const recordFile = options.recordFile ?? path.join(cwd, PREFLIGHT_RECORD_FILE);
  const fingerprint = () => safeFingerprint(options.fingerprint, cwd);
  const before = fingerprint();
  const mismatch = preflightReuseMismatch(readPreflightRecord(recordFile), before, files);
  if (!mismatch) {
    log(`[remote-preflight] reusing passed record for tree ${before.tree.slice(0, 12)}: `
      + `${files.length} selected test file(s) already passed with the same config and environment`);
    return { base, deferred, reused: true, run };
  }
  log(`[remote-preflight] no reusable record (${mismatch}); running related tests`);
  try {
    await (options.runTests ?? runRelatedTests)(files);
  } catch {
    throw new Error(preflightFailureMessage(files));
  }
  log('[remote-preflight] related assertions pass locally');
  // A tree that moved while the tests ran is not the tree that passed.
  const after = fingerprint();
  if (before && after && !preflightReuseMismatch({ ...before, files }, after, files)) {
    writePreflightRecord(recordFile, before, files);
  }
  return { base, deferred, run };
}

function safeFingerprint(compute = computePreflightFingerprint, cwd) {
  try {
    return compute(cwd);
  } catch {
    return null;
  }
}

export function parsePreflightArgs(args) {
  const result = { list: false, scope: 'full' };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === '--list') result.list = true;
    else if (name === '--base' || name === '--scope') {
      const value = args[index + 1];
      if (!value) throw new Error(`${name} requires a value`);
      result[name.slice(2)] = value;
      index += 1;
    } else throw new Error(`Unknown argument: ${name}`);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parsePreflightArgs(process.argv.slice(2));
    const repo = args.base ? undefined : JSON.parse(await capture(runCaptured, 'gh', [
      'repo', 'view', '--json', 'nameWithOwner'
    ], process.cwd())).nameWithOwner;
    await runRemoteQualityPreflight({ ...args, repo });
  } catch (error) {
    console.error(`[remote-preflight] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
