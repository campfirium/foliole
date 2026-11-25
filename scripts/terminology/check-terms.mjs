#!/usr/bin/env node
/* global process */

// Product terminology check driven by scripts/terminology/terms.json.
//   --staged          check copy added to English / Simplified Chinese locale catalogs in the
//                     staged diff; decided avoid-words fail, open ones only warn (pre-commit)
//   --message <file>  warn about avoid-words in a commit message; never fails (commit-msg)
//   --all             report every avoid-word in the controlled locale catalogs (cleanup baseline)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const TERMS_PATH = path.join(SCRIPT_DIR, 'terms.json');
const LOCALE_DIR = 'src/shared/localization/locales';
const CONTROLLED_FILE = /^src\/shared\/localization\/locales\/(en|zhHans)[A-Za-z]*\.ts$/u;
const KEYED_STRING = /^\s*(['"])[^'"]+\1\s*:\s*(['"`])((?:\\.|(?!\2).)*)\2/u;
const ANY_STRING = /(['"`])((?:\\.|(?!\1).)*)\1/gu;

export function loadTerms(termsPath = TERMS_PATH) {
  return JSON.parse(fs.readFileSync(termsPath, 'utf8'));
}

export function localeOfFile(filePath) {
  const match = filePath.replaceAll('\\', '/').match(CONTROLLED_FILE);
  if (!match) return null;
  return match[1] === 'en' ? 'en' : 'zhHans';
}

// Returns the user-visible string values on one catalog line (keys are ignored).
export function extractCopyValues(line) {
  const keyed = line.match(KEYED_STRING);
  if (keyed) return [keyed[3]];
  if (/^\s*(import|export|\/\/|\*)/u.test(line)) return [];
  return [...line.matchAll(ANY_STRING)].map((match) => match[2]);
}

function stripAllowed(text, terms) {
  let result = text;
  for (const phrase of terms.allowPhrases ?? []) {
    result = result.split(phrase).join(' ');
  }
  return result;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// Finds avoid-words in one piece of copy. locale is 'en' or 'zhHans'.
export function findTermIssues(text, locale, terms) {
  let cleaned = stripAllowed(text, terms);
  const issues = [];
  // Rules are ordered longest-first where words overlap (子节点 before 节点); a hit is removed
  // so the same text is not reported twice.
  for (const rule of terms.avoid) {
    const words = rule[locale] ?? [];
    const hit = words.find((word) =>
      locale === 'en'
        ? new RegExp(`\\b${escapeRegExp(word)}\\b`, 'iu').test(cleaned)
        : cleaned.includes(word)
    );
    if (hit) {
      cleaned = locale === 'en' ? cleaned : cleaned.split(hit).join(' ');
      issues.push({
        rule: rule.id,
        word: hit,
        severity: rule.status === 'decided' ? 'error' : 'warn',
        prefer: rule.prefer,
        reason: rule.reason
      });
    }
  }
  return issues;
}

// Checks added catalog lines: [{ file, line, text }] -> issues with location.
export function checkAddedLines(addedLines, terms) {
  const issues = [];
  for (const added of addedLines) {
    const locale = localeOfFile(added.file);
    if (!locale) continue;
    for (const value of extractCopyValues(added.text)) {
      for (const issue of findTermIssues(value, locale, terms)) {
        issues.push({ ...issue, file: added.file, line: added.line, text: value });
      }
    }
  }
  return issues;
}

export function parseAddedLines(unifiedDiff) {
  const added = [];
  let file = null;
  let lineNumber = 0;
  for (const raw of unifiedDiff.split(/\r?\n/u)) {
    if (raw.startsWith('+++ ')) {
      file = raw.startsWith('+++ b/') ? raw.slice(6) : null;
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
    if (hunk) {
      lineNumber = Number(hunk[1]);
      continue;
    }
    if (!file) continue;
    if (raw.startsWith('+')) {
      added.push({ file, line: lineNumber, text: raw.slice(1) });
      lineNumber += 1;
    } else if (!raw.startsWith('-')) {
      lineNumber += 1;
    }
  }
  return added;
}

// Commit messages: English avoid-words outside backticks, always advisory.
export function checkCommitMessage(message, terms) {
  const body = message
    .split(/\r?\n/u)
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .replace(/`[^`]*`/gu, ' ');
  return findTermIssues(body, 'en', terms).map((issue) => ({ ...issue, severity: 'warn' }));
}

function describePrefer(prefer, terms) {
  const names = (prefer ?? []).map((id) => terms.terms.find((term) => term.id === id)?.en ?? id);
  return names.length ? names.join(' / ') : 'a decided product term';
}

function formatIssue(issue, terms) {
  const where = issue.file ? `${issue.file}:${issue.line} ` : '';
  const sample = issue.text ? ` in "${issue.text}"` : '';
  return `[terms] ${issue.severity} ${where}"${issue.word}"${sample} -> prefer ${describePrefer(issue.prefer, terms)}. ${issue.reason}`;
}

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout;
}

function scanAll(repoRoot, terms) {
  const dir = path.join(repoRoot, LOCALE_DIR);
  const issues = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const file = `${LOCALE_DIR}/${name}`;
    if (!localeOfFile(file)) continue;
    const lines = fs.readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/u);
    issues.push(...checkAddedLines(lines.map((text, index) => ({ file, line: index + 1, text })), terms));
  }
  return issues;
}

export function runCli(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr, repoRoot = process.cwd() } = {}) {
  const terms = loadTerms();
  if (argv[0] === '--message') {
    const issues = checkCommitMessage(fs.readFileSync(argv[1], 'utf8'), terms);
    for (const issue of issues) stderr.write(`${formatIssue(issue, terms)}\n`);
    if (issues.length) stderr.write('[terms] Commit message advisory only; rewrite casual words before committing if they describe product objects.\n');
    return 0;
  }
  if (argv[0] === '--all') {
    const issues = scanAll(repoRoot, terms);
    const counts = new Map();
    for (const issue of issues) counts.set(issue.rule, (counts.get(issue.rule) ?? 0) + 1);
    for (const issue of issues) stdout.write(`${formatIssue(issue, terms)}\n`);
    stdout.write(`[terms] total=${issues.length} ${[...counts].map(([rule, count]) => `${rule}=${count}`).join(' ')}\n`);
    return 0;
  }
  if (argv[0] === '--staged') {
    const diff = runGit(['diff', '--cached', '--unified=0', '--no-color', '--', `${LOCALE_DIR}/en*.ts`, `${LOCALE_DIR}/zhHans*.ts`]);
    const issues = checkAddedLines(parseAddedLines(diff), terms);
    for (const issue of issues) stderr.write(`${formatIssue(issue, terms)}\n`);
    const errors = issues.filter((issue) => issue.severity === 'error');
    if (errors.length) {
      stderr.write('[terms] Blocked: new UI copy uses words the terminology table rejects. Rewrite with product terms (scripts/terminology/terms.json).\n');
      return 1;
    }
    return 0;
  }
  stderr.write('usage: check-terms.mjs --staged | --message <file> | --all\n');
  return 2;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runCli();
}
