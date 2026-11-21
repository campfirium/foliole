// Parses the persistent work-amplification table and resolves the code each row cites:
// file names (full paths or bare names) and camelCase identifiers that occur in only a few
// production files. Identifier matches are a heuristic and are reported as such.

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { git } from './maintenance-git.mjs';

const FILE_TOKEN = /[\w./-]+\.(?:tsx|ts|mjs|cjs|js|java|kt|swift|sql)\b/gu;
const IDENTIFIER_TOKEN = /\b[A-Za-z][a-z0-9]+(?:[A-Z][a-z0-9]+){2,}\b/gu;
const IDENTIFIER_SEARCH_PATHS = ['src', 'lib', 'electron', 'android', 'ios', ':!*.test.*', ':!*testSupport*', ':!*.spec.*'];
export const MAX_IDENTIFIER_FILES = 3;

export function parseTableRows(markdown) {
  return markdown.split('\n').filter((line) => /^\|\s*WA-\d+\s*\|/u.test(line)).map((line) => {
    const cells = line.split(/(?<!\\)\|/u).slice(1, -1).map((cell) => cell.trim());
    return { id: cells[0], object: cells[1] ?? '', status: cells[3] ?? '', text: cells.slice(1).join(' | ') };
  });
}

function basenameIndex(trackedFiles) {
  const index = new Map();
  for (const file of trackedFiles) {
    const name = path.posix.basename(file);
    if (!index.has(name)) index.set(name, []);
    index.get(name).push(file);
  }
  return index;
}

export function resolveRowFiles(text, trackedFiles, index = basenameIndex(trackedFiles)) {
  const tracked = new Set(trackedFiles);
  const files = new Set();
  const unresolved = [];
  for (const token of new Set(text.match(FILE_TOKEN) ?? [])) {
    const clean = token.replace(/^\.?\//u, '');
    if (tracked.has(clean)) files.add(clean);
    else if (index.has(path.posix.basename(clean))) for (const file of index.get(path.posix.basename(clean))) files.add(file);
    else unresolved.push(clean);
  }
  return { files: [...files].sort(), unresolved };
}

function rowIdentifiers(text) {
  const fileNames = new Set((text.match(FILE_TOKEN) ?? []).map((token) => path.posix.basename(token).replace(/\.\w+$/u, '')));
  return [...new Set(text.match(IDENTIFIER_TOKEN) ?? [])].filter((token) => !fileNames.has(token));
}

/** One `git grep` for every identifier: token -> production files that mention it as a word. */
export function identifierFiles(cwd, identifiers) {
  const index = new Map();
  if (identifiers.length === 0) return index;
  const patterns = identifiers.flatMap((identifier) => ['-e', identifier]);
  let output = '';
  try {
    output = execFileSync('git', ['grep', '-o', '-w', '-I', '-F', ...patterns, '--', ...IDENTIFIER_SEARCH_PATHS], {
      cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024
    });
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  for (const line of output.split('\n')) {
    const separator = line.lastIndexOf(':');
    if (separator <= 0) continue;
    const token = line.slice(separator + 1);
    if (!index.has(token)) index.set(token, new Set());
    index.get(token).add(line.slice(0, separator));
  }
  return index;
}

/** Returns `(text) => { files, identifiers }` for the rows of one table. */
export function createRowResolver(cwd, rows) {
  const trackedFiles = git(cwd, ['ls-files']).split('\n');
  const index = basenameIndex(trackedFiles);
  const identifiers = identifierFiles(cwd, [...new Set(rows.flatMap((row) => rowIdentifiers(row.text)))]);
  return (text) => {
    const files = new Set(resolveRowFiles(text, trackedFiles, index).files);
    const used = [];
    for (const identifier of rowIdentifiers(text)) {
      const matches = identifiers.get(identifier);
      if (!matches || matches.size > MAX_IDENTIFIER_FILES) continue;
      used.push(identifier);
      for (const file of matches) files.add(file);
    }
    return { files: [...files].sort(), identifiers: used };
  };
}
