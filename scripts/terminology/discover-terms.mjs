#!/usr/bin/env node
/* global process */

// Lists English words that newly appeared in UI copy since the last terminology review, so
// drift words (like "nested") reach a human before they spread. The avoid list in terms.json
// only catches words someone already rejected; this catches the ones nobody has looked at.
//   (no flags)       words in copy added between terms.json discoveryBaseline and HEAD
//   --since <rev>    use another baseline
//   --advance        after review, move discoveryBaseline to HEAD
// Simplified Chinese is not tokenized here; its decided terms are enforced by check-terms.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { TERMS_PATH, extractCopyValues, loadTerms, localeOfFile, parseAddedLines } from './check-terms.mjs';

const LOCALE_DIR = 'src/shared/localization/locales';
const WORD = /[A-Za-z][A-Za-z'-]*[A-Za-z]/gu;
// Terms live in labels, buttons, menus, and titles; long help sentences are mostly prose noise.
const MAX_LABEL_WORDS = 6;

export function tokenize(text) {
  const words = text.replace(/\{[^}]*\}/gu, ' ').match(WORD) ?? [];
  return words.map((word) => word.toLowerCase()).filter((word) => word.length >= 3);
}

function singular(word, known) {
  if (word.endsWith('ies') && known.has(`${word.slice(0, -3)}y`)) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && known.has(word.slice(0, -1))) return word.slice(0, -1);
  return word;
}

export function knownVocabulary(baselineValues, terms) {
  const known = new Set();
  for (const value of baselineValues) for (const word of tokenize(value)) known.add(word);
  for (const term of terms.terms) for (const word of tokenize(term.en)) known.add(word);
  for (const rule of terms.avoid) for (const word of rule.en ?? []) known.add(word.toLowerCase());
  return known;
}

// addedLines: [{ file, line, text }] from English catalogs. Returns [{ word, samples }].
export function discoverNewWords(addedLines, known) {
  const found = new Map();
  for (const added of addedLines) {
    if (localeOfFile(added.file) !== 'en') continue;
    for (const value of extractCopyValues(added.text)) {
      if (value.split(/\s+/u).length > MAX_LABEL_WORDS) continue;
      for (const raw of tokenize(value)) {
        if (raw.endsWith('ly')) continue;
        const word = singular(raw, known);
        if (known.has(word)) continue;
        const entry = found.get(word) ?? { word, samples: [] };
        if (entry.samples.length < 2) entry.samples.push(`${added.file}:${added.line} "${value}"`);
        found.set(word, entry);
      }
    }
  }
  return [...found.values()].sort((a, b) => a.word.localeCompare(b.word));
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout;
}

function baselineValues(rev) {
  const files = git(['ls-tree', '--name-only', rev, `${LOCALE_DIR}/`]).split('\n')
    .filter((file) => localeOfFile(file) === 'en');
  return files.flatMap((file) => git(['show', `${rev}:${file}`]).split('\n').flatMap(extractCopyValues));
}

export function runCli(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
  const terms = loadTerms();
  if (argv.includes('--advance')) {
    const head = git(['rev-parse', 'HEAD']).trim();
    fs.writeFileSync(TERMS_PATH, `${JSON.stringify({ ...terms, discoveryBaseline: head }, null, 2)}\n`);
    stdout.write(`[terms-discover] baseline moved to ${head}\n`);
    return 0;
  }
  const sinceIndex = argv.indexOf('--since');
  const base = sinceIndex >= 0 ? argv[sinceIndex + 1] : terms.discoveryBaseline;
  const diff = git(['diff', '--unified=0', '--no-color', base, 'HEAD', '--', `${LOCALE_DIR}/en*.ts`]);
  const words = discoverNewWords(parseAddedLines(diff), knownVocabulary(baselineValues(base), terms));
  for (const { word, samples } of words) stdout.write(`[terms-discover] ${word}\n${samples.map((s) => `    ${s}\n`).join('')}`);
  stdout.write(`[terms-discover] new=${words.length} since=${base.slice(0, 9)}\n`);
  if (words.length) {
    stdout.write('[terms-discover] Review each word: add it to avoid in terms.json if it should not appear, otherwise leave it; then run with --advance.\n');
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runCli();
}
