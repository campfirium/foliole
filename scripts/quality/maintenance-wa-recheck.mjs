#!/usr/bin/env node
/* global console, process */

// Work-amplification table recheck candidates: for each `| WA-nnn |` row of the persistent
// table, resolve the files and evidence commits it cites, and list the rows whose files
// changed after the newest evidence commit. Prints candidates only; never edits the table.
//
//   node scripts/quality/maintenance-wa-recheck.mjs [--table <work-amplification-checks.md>]
//        [--to dev] [--json]

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_REPO_ROOT, git, isAncestor, resolveCommit } from './maintenance-git.mjs';
import { createRowResolver, parseTableRows } from './maintenance-wa-table.mjs';

export const DEFAULT_TABLE = '.lab/atlas/8performance/work-amplification-checks.md';
const COMMIT_TOKEN = /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/gu;
// commit-note numbers such as `006915`, which open every commit subject.
const NOTE_TOKEN = /(?<![\w-])\d{6}(?![\w-])/gu;

/** commit-note number -> commit, from the subjects reachable from the target. */
export function commitNoteIndex(cwd, targetCommit) {
  const index = new Map();
  for (const line of git(cwd, ['log', '--format=%H %s', targetCommit]).split('\n')) {
    const match = /^(\w+) (\d{6}) /u.exec(line);
    if (match && !index.has(match[2])) index.set(match[2], match[1]);
  }
  return index;
}

function evidenceTokens(text, noteIndex) {
  const hashes = [...new Set(text.match(COMMIT_TOKEN) ?? [])].map((token) => ({ token, ref: token }));
  const notes = [...new Set(text.match(NOTE_TOKEN) ?? [])].filter((token) => noteIndex.has(token))
    .map((token) => ({ token, ref: noteIndex.get(token) }));
  return [...hashes, ...notes];
}

function newestEvidence(cwd, text, targetCommit, noteIndex) {
  let newest = null;
  for (const { token, ref } of evidenceTokens(text, noteIndex)) {
    const commit = resolveCommit(cwd, ref);
    if (!commit || !isAncestor(cwd, commit, targetCommit)) continue;
    if (newest?.commit === commit) continue;
    const time = Number(git(cwd, ['log', '-1', '--format=%ct', commit]));
    const later = newest && (isAncestor(cwd, newest.commit, commit) || (time > newest.time && !isAncestor(cwd, commit, newest.commit)));
    if (!newest || later) newest = { token, commit, time };
  }
  return newest;
}

function changesSince(cwd, base, target, files) {
  const changed = git(cwd, ['diff', '--name-only', base, target, '--', ...files]).split('\n').filter(Boolean);
  if (changed.length === 0) return null;
  const log = git(cwd, ['log', '--no-merges', '--format=%h %cs %s', `${base}..${target}`, '--', ...changed]);
  return { changed, commits: log ? log.split('\n') : [] };
}

export function findRecheckCandidates({ cwd, markdown, to = 'dev' }) {
  const targetCommit = resolveCommit(cwd, to);
  if (!targetCommit) throw new Error(`target not found: ${to}`);
  const rows = parseTableRows(markdown);
  const resolveRow = createRowResolver(cwd, rows);
  const noteIndex = commitNoteIndex(cwd, targetCommit);
  const result = { to, rows: 0, candidates: [], unchanged: [], noFiles: [], noEvidence: [] };
  for (const row of rows) {
    result.rows += 1;
    const { files, identifiers } = resolveRow(row.text);
    if (files.length === 0) {
      result.noFiles.push(row.id);
      continue;
    }
    const evidence = newestEvidence(cwd, row.text, targetCommit, noteIndex);
    if (!evidence) {
      result.noEvidence.push(row.id);
      continue;
    }
    const changes = changesSince(cwd, evidence.commit, targetCommit, files);
    if (!changes) result.unchanged.push(row.id);
    else result.candidates.push({ id: row.id, object: row.object, status: row.status, evidence: evidence.token, files, identifiers, ...changes });
  }
  return result;
}

function shorten(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function renderRecheckMarkdown(result) {
  const lines = [
    `WA 表 ${result.rows} 行，对照 \`${result.to}\`：待重查候选 ${result.candidates.length}，证据后未变 ${result.unchanged.length}，` +
      `无可解析路径 ${result.noFiles.length}，无可用证据提交 ${result.noEvidence.length}（只输出，未改表）`,
    '',
    '| ID | 对象 | 当前状态 | 证据提交 | 之后变化的路径 | 相关提交 |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  for (const candidate of result.candidates) {
    const paths = candidate.changed.slice(0, 4).map((file) => `\`${file}\``).join('<br>') +
      (candidate.changed.length > 4 ? `<br>等 ${candidate.changed.length} 个` : '') +
      (candidate.identifiers.length > 0 ? `<br>（含经标识符定位：${candidate.identifiers.join(', ')}）` : '');
    const commits = candidate.commits.slice(0, 3).join('<br>') + (candidate.commits.length > 3 ? `<br>共 ${candidate.commits.length} 个` : '');
    const cells = [candidate.id, shorten(candidate.object, 60), shorten(candidate.status, 40), candidate.evidence, paths, commits];
    lines.push(`| ${cells.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`);
  }
  if (result.noFiles.length > 0) lines.push('', `无可解析路径（需人工核对）：${result.noFiles.join(', ')}`);
  if (result.noEvidence.length > 0) lines.push(`无可用证据提交（需人工核对）：${result.noEvidence.join(', ')}`);
  return lines.join('\n');
}

export function runCli(argv) {
  const args = { json: argv.includes('--json') };
  for (const flag of ['--table', '--to', '--repo']) {
    const index = argv.indexOf(flag);
    if (index >= 0) args[flag.slice(2)] = argv[index + 1];
  }
  const repoRoot = path.resolve(args.repo ?? DEFAULT_REPO_ROOT);
  const tablePath = path.resolve(repoRoot, args.table ?? DEFAULT_TABLE);
  if (!existsSync(tablePath)) throw new Error(`table not found: ${tablePath} (pass --table)`);
  const result = findRecheckCandidates({ cwd: repoRoot, markdown: readFileSync(tablePath, 'utf8'), to: args.to ?? 'dev' });
  return args.json ? JSON.stringify(result, null, 2) : renderRecheckMarkdown(result);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    console.log(runCli(process.argv.slice(2)));
  } catch (error) {
    console.error(`[maintenance-wa-recheck] ${error.message}`);
    process.exitCode = 1;
  }
}
