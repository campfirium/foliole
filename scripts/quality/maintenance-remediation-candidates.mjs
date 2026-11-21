#!/usr/bin/env node
/* global console, process */

// Remediation-review candidates: commits in a range whose subject matches the skill's
// work-amplification keywords, minus test, hosted and docs commits, with each commit's
// `context:` paragraph so the agent can classify them against runtime-problem-patterns.
//
//   node scripts/quality/maintenance-remediation-candidates.mjs [--from <ref>] [--to dev] [--json]
//
// Without --from the range starts at the ledger's last remediation-review run.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEST_FILE_PATTERN } from '../lib/path-domain-registry.mjs';
import { DEFAULT_REPO_ROOT, git, resolveCommit } from './maintenance-git.mjs';
import { latestRun, readLedger, resolveLedgerPath } from './maintenance-ledger.mjs';

// Same keywords as runtime-problem-patterns.md "找证据".
export const SUBJECT_KEYWORDS =
  /every |each |whole|full|batch|per[- ]|bridge|plugin|native|main thread|block|freez|hang|stall|slow|repeat|re-?(load|scan|read|query|register|pull)|loop|storm|flood|leak|unbounded|large|scan/giu;
const EXCLUDED_SUBJECT = /\b(hosted|fixtures?|docs?|documentation|readme)\b/iu;
const TEST_ONLY_SUBJECT = /^(\d+\s+)?(add|fix|update|stabili[sz]e|split|move|rename|deflake)?\s*(the\s+)?(tests?|specs?)\b/iu;
const NON_PRODUCT_PATH = /(^docs\/|^\.github\/|^scripts\/quality\/|\.md$|\.testSupport\.|\.test-support\.|\/fixtures?\/)/u;

function exclusionReason(subject, files) {
  if (EXCLUDED_SUBJECT.test(subject)) return 'hosted/文档/fixture 标题';
  if (TEST_ONLY_SUBJECT.test(subject)) return '测试标题';
  if (files.length > 0 && files.every((file) => TEST_FILE_PATTERN.test(file) || NON_PRODUCT_PATH.test(file))) {
    return '只改测试、文档或质检脚本';
  }
  return null;
}

export function extractContext(body) {
  const lines = [];
  let inContext = false;
  for (const line of body.split('\n')) {
    if (/^context:/u.test(line)) inContext = true;
    else if (/^(change|intent):/u.test(line)) inContext = false;
    if (inContext) lines.push(line);
  }
  return lines.join(' ').replace(/^context:\s*/u, '').replace(/\s+/gu, ' ').trim() || null;
}

function logRange(cwd, from, to) {
  const output = git(cwd, ['log', '--no-merges', '--format=%H%x1f%cs%x1f%s', `${from}..${to}`]);
  return output ? output.split('\n').map((line) => { const [hash, date, subject] = line.split('\x1f'); return { hash, date, subject }; }) : [];
}

export function findRemediationCandidates({ cwd, from, to = 'dev' }) {
  const fromCommit = resolveCommit(cwd, from);
  const toCommit = resolveCommit(cwd, to);
  if (!fromCommit) throw new Error(`range start not found: ${from}`);
  if (!toCommit) throw new Error(`range end not found: ${to}`);
  const commits = logRange(cwd, fromCommit, toCommit);
  const matched = commits.filter((commit) => commit.subject.match(SUBJECT_KEYWORDS));
  const candidates = [];
  const excluded = {};
  for (const commit of matched) {
    const files = git(cwd, ['show', '--name-only', '--format=', commit.hash]).split('\n').filter(Boolean);
    const reason = exclusionReason(commit.subject, files);
    if (reason) {
      excluded[reason] = (excluded[reason] ?? 0) + 1;
      continue;
    }
    const keywords = [...new Set(commit.subject.match(SUBJECT_KEYWORDS).map((keyword) => keyword.trim().toLowerCase()))];
    candidates.push({ ...commit, keywords, context: extractContext(git(cwd, ['log', '-1', '--format=%B', commit.hash])) });
  }
  return { from, to, total: commits.length, matched: matched.length, excluded, candidates };
}

export function renderCandidatesMarkdown(result) {
  const excluded = Object.entries(result.excluded).map(([reason, count]) => `${reason} ${count}`).join('，') || '无';
  const lines = [
    `区间 \`${result.from}..${result.to}\`：提交 ${result.total} 个，标题命中 ${result.matched} 个，剔除 ${excluded}；候选 ${result.candidates.length} 个`,
    ''
  ];
  for (const candidate of result.candidates) {
    lines.push(`- \`${candidate.hash.slice(0, 9)}\` ${candidate.date} ${candidate.subject}（关键词：${candidate.keywords.join(', ')}）`);
    lines.push(`  - context: ${candidate.context ?? '（无 context 段）'}`);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { json: argv.includes('--json') };
  for (const flag of ['--from', '--to', '--repo', '--ledger']) {
    const index = argv.indexOf(flag);
    if (index >= 0) args[flag.slice(2)] = argv[index + 1];
  }
  return args;
}

export function runCli(argv) {
  const args = parseArgs(argv);
  const repoRoot = path.resolve(args.repo ?? DEFAULT_REPO_ROOT);
  let from = args.from;
  if (!from) {
    const run = latestRun(readLedger(resolveLedgerPath(repoRoot, args.ledger)), 'remediation-review');
    from = run?.release && resolveCommit(repoRoot, run.release) ? run.release : run?.revision;
    if (!from) throw new Error('no --from given and the ledger has no remediation-review run');
  }
  const result = findRemediationCandidates({ cwd: repoRoot, from, to: args.to ?? 'dev' });
  return args.json ? JSON.stringify(result, null, 2) : renderCandidatesMarkdown(result);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    console.log(runCli(process.argv.slice(2)));
  } catch (error) {
    console.error(`[maintenance-remediation-candidates] ${error.message}`);
    process.exitCode = 1;
  }
}
