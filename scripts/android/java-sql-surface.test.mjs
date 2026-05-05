import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JAVA_ROOT = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android');
const SQL_LITERAL_PATTERN = /"[^"\n]*(?:SELECT|PRAGMA|sqlite_master)[^"\n]*"/g;

const ALLOWED_SQL_LITERALS = [
  {
    file: 'FolioleCompanionSqliteRuntime.java',
    literal: '"PRAGMA wal_checkpoint(FULL)"'
  },
  {
    file: 'FolioleCompanionSqliteRuntime.java',
    literal: '"SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ? LIMIT 1"'
  },
  {
    file: 'FolioleCompanionSqliteRuntime.java',
    literal: '"PRAGMA table_info("'
  }
];
const ALLOWED_DIRECT_NAMED_QUERY = [
  {
    file: 'FolioleCompanionGeneratedQueryRunner.java',
    text: 'FolioleCompanionNamedQueryStore.'
  }
];
const ALLOWED_DIRECT_NAMED_MUTATION = [
  {
    file: 'FolioleCompanionGeneratedMutationRunner.java',
    text: 'FolioleCompanionNamedMutationStore.'
  }
];

function collectJavaFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.java') ? [entryPath] : [];
  });
}

function relativeFile(filePath) {
  return path.relative(JAVA_ROOT, filePath).replaceAll(path.sep, '/');
}

function sqlLiterals(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return [...content.matchAll(SQL_LITERAL_PATTERN)].map((match) => ({
    file: relativeFile(filePath),
    literal: match[0]
  }));
}

function isAllowedSqlLiteral(entry) {
  return ALLOWED_SQL_LITERALS.some((allowed) => allowed.file === entry.file && allowed.literal === entry.literal);
}

function interestingAccessLines(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line, index) => ({ file: relativeFile(filePath), line: index + 1, text: line.trim() }))
    .filter((entry) => /\bdatabase\.(?:rawQuery|query|execSQL)\(|\.compileStatement\(/.test(entry.text));
}

function directNamedQueryLines(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line, index) => ({ file: relativeFile(filePath), line: index + 1, text: line.trim() }))
    .filter((entry) => entry.file !== 'FolioleCompanionNamedQueryStore.java')
    .filter((entry) => entry.text.includes('FolioleCompanionNamedQueryStore.'));
}

function directNamedMutationLines(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line, index) => ({ file: relativeFile(filePath), line: index + 1, text: line.trim() }))
    .filter((entry) => entry.file !== 'FolioleCompanionNamedMutationStore.java')
    .filter((entry) => entry.text.includes('FolioleCompanionNamedMutationStore.'));
}

function isAllowedAccessLine(entry) {
  if (entry.file === 'FolioleCompanionNamedQueryStore.java') {
    return entry.text.includes('database.rawQuery(sql, args)');
  }
  if (entry.file === 'FolioleCompanionNamedMutationStore.java') {
    return entry.text.includes('database.compileStatement(statement(context, statementName))') ||
      entry.text.includes('database.execSQL(statement(context,');
  }
  if (entry.file === 'FolioleCompanionSchemaInstaller.java') {
    return entry.text.includes('database.execSQL(statement)');
  }
  return entry.file === 'FolioleCompanionSqliteRuntime.java';
}

function isAllowedDirectNamedQuery(entry) {
  return ALLOWED_DIRECT_NAMED_QUERY.some((allowed) => allowed.file === entry.file && entry.text.includes(allowed.text));
}

function isAllowedDirectNamedMutation(entry) {
  return ALLOWED_DIRECT_NAMED_MUTATION.some((allowed) => allowed.file === entry.file && entry.text.includes(allowed.text));
}

describe('Android Java SQL surface', () => {
  it('keeps direct Java SQL limited to generated runners and runtime probes', () => {
    const files = collectJavaFiles(JAVA_ROOT);
    const unexpectedLiterals = files.flatMap(sqlLiterals).filter((entry) => !isAllowedSqlLiteral(entry));
    const unexpectedAccess = files.flatMap(interestingAccessLines).filter((entry) => !isAllowedAccessLine(entry));
    const unexpectedDirectNamedQuery = files.flatMap(directNamedQueryLines).filter((entry) => !isAllowedDirectNamedQuery(entry));
    const unexpectedDirectNamedMutation = files.flatMap(directNamedMutationLines).filter((entry) => !isAllowedDirectNamedMutation(entry));

    expect(unexpectedLiterals).toEqual([]);
    expect(unexpectedAccess).toEqual([]);
    expect(unexpectedDirectNamedQuery).toEqual([]);
    expect(unexpectedDirectNamedMutation).toEqual([]);
  });
});
