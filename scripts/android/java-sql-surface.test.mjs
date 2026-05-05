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
const ALLOWED_DIRECT_LOAD_ARRAY = [
  {
    file: 'FolioleCompanionDatabaseHelper.java',
    text: 'return FolioleCompanionNamedQueryStore.loadArray(context, database, "nodeConflicts");'
  },
  {
    file: 'FolioleCompanionDatabaseMigration.java',
    text: 'JSONArray rows = FolioleCompanionNamedQueryStore.loadArray(context, database, "migrationLegacySyncObjectStateRows").getJSONArray("rows");'
  },
  {
    file: 'FolioleCompanionSyncObjectStore.java',
    text: 'return FolioleCompanionNamedQueryStore.loadArray(context, database, "syncIndex");'
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
    .filter((entry) => /\bdatabase\.(?:rawQuery|query)\(|\.compileStatement\(/.test(entry.text));
}

function directLoadArrayLines(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line, index) => ({ file: relativeFile(filePath), line: index + 1, text: line.trim() }))
    .filter((entry) => entry.file !== 'FolioleCompanionNamedQueryStore.java')
    .filter((entry) => entry.text.includes('FolioleCompanionNamedQueryStore.loadArray(context, database'));
}

function isAllowedAccessLine(entry) {
  if (entry.file === 'FolioleCompanionNamedQueryStore.java') {
    return entry.text.includes('database.rawQuery(sql, args)');
  }
  if (entry.file === 'FolioleCompanionNamedMutationStore.java') {
    return entry.text.includes('database.compileStatement(statement(context, statementName))');
  }
  return entry.file === 'FolioleCompanionSqliteRuntime.java';
}

function isAllowedDirectLoadArray(entry) {
  return ALLOWED_DIRECT_LOAD_ARRAY.some((allowed) => allowed.file === entry.file && allowed.text === entry.text);
}

describe('Android Java SQL surface', () => {
  it('keeps direct Java SQL limited to generated runners and runtime probes', () => {
    const files = collectJavaFiles(JAVA_ROOT);
    const unexpectedLiterals = files.flatMap(sqlLiterals).filter((entry) => !isAllowedSqlLiteral(entry));
    const unexpectedAccess = files.flatMap(interestingAccessLines).filter((entry) => !isAllowedAccessLine(entry));
    const unexpectedDirectLoadArray = files.flatMap(directLoadArrayLines).filter((entry) => !isAllowedDirectLoadArray(entry));

    expect(unexpectedLiterals).toEqual([]);
    expect(unexpectedAccess).toEqual([]);
    expect(unexpectedDirectLoadArray).toEqual([]);
  });
});
