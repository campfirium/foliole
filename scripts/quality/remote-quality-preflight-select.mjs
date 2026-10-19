import path from 'node:path';

const TEST_FILE_PATTERN = /\.test\.(?:mjs|ts|tsx)$/u;
const MIN_TOKEN_LENGTH = 8;
const GENERIC_NAMES = new Set([
  'constants', 'package-lock.json', 'package.json', 'tsconfig.json', 'utils'
]);
const REASON_PRIORITY = { changed: 0, sibling: 1, path: 2, name: 3 };

export function isPreflightTestFile(file) {
  return TEST_FILE_PATTERN.test(file);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// A stem may be followed only by a script extension, as in `./name.js` imports
// of `name.ts`; otherwise `name` would also match `name.yml`.
const STEM_SUFFIX = '(?=$|[^\\w.-]|\\.[cm]?[jt]sx?(?![\\w-]))';

function boundedPattern(token, suffix = '(?![\\w-])') {
  return new RegExp(`(?<![\\w-])${escapeRegExp(token)}${suffix}`, 'u');
}

function isDistinctiveName(name) {
  if (name.length < MIN_TOKEN_LENGTH || GENERIC_NAMES.has(name)) return false;
  return /[-_.]|[a-z][A-Z]/u.test(name);
}

// A changed file is linked to a test either by its repo path or by a
// distinctive file name, which covers imports and contract tests that read files.
export function changedFileTokens(file) {
  if (GENERIC_NAMES.has(file)) return [];
  const base = path.posix.basename(file);
  const stem = base.replace(/\.[^.]+$/u, '');
  const tokens = [{ kind: 'path', pattern: boundedPattern(file) }];
  if (isDistinctiveName(base)) tokens.push({ kind: 'name', pattern: boundedPattern(base) });
  if (stem !== base && isDistinctiveName(stem)) {
    tokens.push({ kind: 'name', pattern: boundedPattern(stem, STEM_SUFFIX) });
  }
  return tokens;
}

function siblingStem(file) {
  return file.replace(/\.[^./]+$/u, '');
}

function addReason(selected, file, reason, source) {
  const entry = selected.get(file) ?? { file, reasons: [] };
  entry.reasons.push({ reason, source });
  selected.set(file, entry);
}

function priority(entry) {
  return Math.min(...entry.reasons.map(({ reason }) => REASON_PRIORITY[reason]));
}

export function selectPreflightTests({ changedFiles, readText, testFiles }) {
  const selected = new Map();
  const existingTests = new Set(testFiles);
  const tokens = changedFiles.map((file) => ({ file, tokens: changedFileTokens(file) }));
  for (const file of changedFiles) {
    if (existingTests.has(file)) addReason(selected, file, 'changed', file);
  }
  for (const test of testFiles) {
    const stem = siblingStem(test.replace(/\.test(?=\.[^.]+$)/u, ''));
    const text = readText(test);
    for (const change of tokens) {
      if (change.file === test) continue;
      if (siblingStem(change.file) === stem) addReason(selected, test, 'sibling', change.file);
      const hit = change.tokens.find(({ pattern }) => pattern.test(text));
      if (hit) addReason(selected, test, hit.kind, change.file);
    }
  }
  return [...selected.values()].sort((left, right) => (
    priority(left) - priority(right) || left.file.localeCompare(right.file)
  ));
}

export function capPreflightTests(entries, cap) {
  return { run: entries.slice(0, cap), deferred: entries.slice(cap) };
}
