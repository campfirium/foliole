#!/usr/bin/env node
/* global console, process */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_COMMENT_PATTERN = /^\s*\/\/\s*SKIP:\s*(.+?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*revive:\s*(.+?)\s*$/;
const TEST_SKIP_PATTERN = /^\s*(?:it|test)\.skip\s*\(/;
const UNSUPPORTED_SKIP_PATTERN = /^\s*(?:describe\.skip|(?:it|test)\.each\b.*\.skip)\s*\(/;
const STALE_DAYS = 30;

function usage() {
  console.error('Usage: node scripts/quality/quality-skip-lint.mjs');
}

function parseToday() {
  const value = process.env.QUALITY_SKIP_LINT_TODAY;
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`);
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dayAge(dateText, today) {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.floor((today.getTime() - date.getTime()) / 86_400_000);
}

function isIgnoredDir(name) {
  return name === '.git' || name === 'node_modules' || name === '.tmp' || name === 'dist' || name === 'build';
}

async function collectByWalking(rootDir) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!isIgnoredDir(entry.name)) {
          await walk(path.join(dir, entry.name));
        }
        continue;
      }
      if (entry.isFile()) {
        const filePath = path.join(dir, entry.name);
        if (TEST_FILE_PATTERN.test(filePath)) {
          files.push(path.relative(rootDir, filePath).split(path.sep).join('/'));
        }
      }
    }
  }

  await walk(rootDir);
  return files.sort();
}

async function collectTestFiles(rootDir) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: rootDir,
    encoding: 'utf8'
  });

  if (result.status === 0) {
    return result.stdout
      .split('\n')
      .filter((filePath) => TEST_FILE_PATTERN.test(filePath))
      .sort();
  }

  return collectByWalking(rootDir);
}

function previousNonEmptyLine(lines, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (lines[cursor].trim() !== '') {
      return { index: cursor, text: lines[cursor] };
    }
  }
  return null;
}

function nextNonEmptyLine(lines, index) {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (lines[cursor].trim() !== '') {
      return { index: cursor, text: lines[cursor] };
    }
  }
  return null;
}

function location(filePath, lineIndex) {
  return `${filePath}:${lineIndex + 1}`;
}

function lintFile(filePath, source, today) {
  const errors = [];
  const warnings = [];
  const lines = source.split(/\r?\n/);
  const validSkipCommentLines = new Set();

  lines.forEach((line, index) => {
    if (line.includes('SKIP_PENDING')) {
      errors.push(`${location(filePath, index)} unsupported SKIP_PENDING marker`);
      return;
    }

    if (!/^\s*\/\//.test(line) || !line.includes('SKIP:')) {
      return;
    }

    const match = line.match(SKIP_COMMENT_PATTERN);
    if (!match) {
      errors.push(`${location(filePath, index)} invalid SKIP comment format`);
      return;
    }

    const [, reason, dateText, revive] = match;
    if (!reason.trim() || !revive.trim()) {
      errors.push(`${location(filePath, index)} SKIP comment requires reason and revive condition`);
      return;
    }

    const next = nextNonEmptyLine(lines, index);
    if (!next || !TEST_SKIP_PATTERN.test(next.text)) {
      errors.push(`${location(filePath, index)} SKIP comment must be directly above it.skip/test.skip`);
      return;
    }

    validSkipCommentLines.add(index);
    const age = dayAge(dateText, today);
    if (age === null) {
      errors.push(`${location(filePath, index)} invalid SKIP date`);
    } else if (age > STALE_DAYS) {
      warnings.push(`${location(filePath, index)} stale SKIP is ${age} days old`);
    }
  });

  lines.forEach((line, index) => {
    if (UNSUPPORTED_SKIP_PATTERN.test(line)) {
      errors.push(`${location(filePath, index)} unsupported skip form for v1`);
      return;
    }
    if (!TEST_SKIP_PATTERN.test(line)) {
      return;
    }

    const previous = previousNonEmptyLine(lines, index);
    if (!previous || !validSkipCommentLines.has(previous.index)) {
      errors.push(`${location(filePath, index)} it.skip/test.skip requires adjacent SKIP comment`);
    }
  });

  return { errors, warnings };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    usage();
    process.exit(2);
  }

  const rootDir = process.cwd();
  const today = parseToday();
  const files = await collectTestFiles(rootDir);
  const errors = [];
  const warnings = [];

  for (const filePath of files) {
    const source = await readFile(path.join(rootDir, filePath), 'utf8');
    const result = lintFile(filePath, source, today);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  for (const warning of warnings) {
    console.warn(`[quality-skip-lint] warning: ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[quality-skip-lint] error: ${error}`);
    }
    process.exit(1);
  }

  console.log(`[quality-skip-lint] checked ${files.length} test file(s)`);
}

main().catch((error) => {
  console.error(`[quality-skip-lint] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
