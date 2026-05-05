#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TARGET_LINES = 220;
const HARD_LINES = 260;
const JS_LIKE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);

function classifyLineBudget(lines) {
  if (lines >= HARD_LINES) {
    return 'blocked';
  }

  if (lines >= TARGET_LINES) {
    return 'split';
  }

  if (lines >= 200) {
    return 'tight';
  }

  return 'ok';
}

function countNonEmptyLines(content) {
  return content.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function countJsLikeEffectiveLines(content) {
  const lines = content.split(/\r?\n/);
  let inBlockComment = false;
  let inString = null;
  let escaped = false;
  let effectiveLines = 0;

  for (const line of lines) {
    let hasCode = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];

      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          index += 1;
        }
        continue;
      }

      if (inString) {
        if (!/\s/.test(char)) {
          hasCode = true;
        }

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          continue;
        }

        if (char === inString) {
          inString = null;
        }
        continue;
      }

      if (char === '/' && next === '/') {
        break;
      }

      if (char === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = char;
        hasCode = true;
        continue;
      }

      if (!/\s/.test(char)) {
        hasCode = true;
      }
    }

    if (hasCode) {
      effectiveLines += 1;
    }
  }

  return effectiveLines;
}

function countBudgetLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const extension = path.extname(filePath);

  if (JS_LIKE_EXTENSIONS.has(extension)) {
    return countJsLikeEffectiveLines(content);
  }

  return countNonEmptyLines(content);
}

function formatBudget(filePath, lines) {
  const status = classifyLineBudget(lines);
  const targetRemaining = TARGET_LINES - lines;
  const hardRemaining = HARD_LINES - lines;
  const adviceByStatus = {
    blocked: 'do not append; split, delete, or move code out first',
    ok: 'normal edit budget',
    split: 'split before adding responsibility; only delete, move, or tiny fixes here',
    tight: 'small edits only; avoid adding responsibility'
  };

  return [
    `${filePath}: ${status}`,
    `lines=${lines}`,
    `targetRemaining=${targetRemaining}`,
    `hardRemaining=${hardRemaining}`,
    `advice="${adviceByStatus[status]}"`
  ].join(' ');
}

function main(argv) {
  if (argv.length === 0) {
    process.stderr.write('Usage: node scripts/check-file-budget.mjs <file...>\n');
    return 2;
  }

  let exitCode = 0;

  for (const filePath of argv) {
    const lines = countBudgetLines(filePath);
    const status = classifyLineBudget(lines);
    process.stdout.write(`${formatBudget(filePath, lines)}\n`);

    if (status === 'blocked') {
      exitCode = 2;
    } else if (status === 'split' && exitCode === 0) {
      exitCode = 1;
    }
  }

  return exitCode;
}

process.exitCode = main(process.argv.slice(2));
