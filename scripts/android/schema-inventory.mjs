/* global console, process */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractArrayBody,
  extractJavaExecSqlArguments,
  extractStatementsFromBody,
  quoteIdentifier
} from './schema-inventory-parse.mjs';
import {
  ANDROID_ONLY_TABLES,
  CORE_TABLES,
  classifyDifferenceField,
  classifyTableName,
  DESKTOP_ONLY_TABLES
} from './schema-inventory-rules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const DESKTOP_SCHEMA_FILES = {
  DESKTOP_CORE_SCHEMA_STATEMENTS: 'lib/core/database/desktopCoreSchemaStatements.ts',
  DESKTOP_FRESH_SCHEMA_STATEMENTS: 'lib/core/database/desktopFreshSchemaStatements.ts',
  DESKTOP_RESOURCE_SCHEMA_STATEMENTS: 'lib/core/database/desktopResourceSchemaStatements.ts',
  EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS: 'lib/core/database/externalDocumentSchemaStatements.ts',
  KEEP_IMPORT_SCHEMA_STATEMENTS: 'lib/core/database/keepImportSchemaStatements.ts',
  SYNC_SCHEMA_STATEMENTS: 'lib/core/database/syncSchemaStatements.ts'
};

export function buildSchemaDriftReport(repoRoot = REPO_ROOT) {
  const desktopStatements = loadDesktopFreshSchemaStatements(repoRoot);
  const androidStatements = loadAndroidSchemaAssetStatements(repoRoot);
  const javaStatements = loadAndroidJavaMigrationStatements(repoRoot);
  const desktop = buildInventory(desktopStatements);
  const android = buildInventory(androidStatements);
  const androidJava = buildInventory(javaStatements);
  const drift = compareInventories(desktop, android);

  return {
    androidOnly: drift.androidOnly,
    androidJavaSharedDdl: summarizeJavaSharedDdl(androidJava),
    desktopOnly: drift.desktopOnly,
    shared: drift.shared,
    sources: {
      androidAssetStatements: androidStatements.length,
      androidJavaMigrationStatements: javaStatements.length,
      desktopStatements: desktopStatements.length
    },
    unattributed: drift.unattributed
  };
}

export function loadDesktopFreshSchemaStatements(repoRoot = REPO_ROOT) {
  const arrays = Object.fromEntries(
    Object.entries(DESKTOP_SCHEMA_FILES).map(([name, relativePath]) => [
      name,
      extractStatementsFromArray(readRepoFile(repoRoot, relativePath), name)
    ])
  );
  const source = readRepoFile(repoRoot, DESKTOP_SCHEMA_FILES.DESKTOP_FRESH_SCHEMA_STATEMENTS);
  const body = extractArrayBody(source, 'DESKTOP_FRESH_SCHEMA_STATEMENTS');
  return extractStatementsFromBody(body, arrays);
}

export function loadAndroidSchemaAssetStatements(repoRoot = REPO_ROOT) {
  const json = readRepoFile(repoRoot, 'android/app/src/main/assets/companion-core-schema.json');
  const parsed = JSON.parse(json);
  return parsed.statements;
}

export function loadAndroidJavaMigrationStatements(repoRoot = REPO_ROOT) {
  const source = readRepoFile(
    repoRoot,
    'android/app/src/main/java/com/foliole/android/FolioleCompanionDatabaseMigration.java'
  );
  return extractJavaExecSqlArguments(source)
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => (
      /^CREATE TABLE IF NOT EXISTS [A-Za-z_]/i.test(statement)
      || /^CREATE TABLE (?!IF\b)[A-Za-z_]/i.test(statement)
    ));
}

function compareInventories(desktop, android) {
  const desktopTables = new Set(Object.keys(desktop.tables));
  const androidTables = new Set(Object.keys(android.tables));
  const desktopOnly = [...desktopTables]
    .filter((table) => !androidTables.has(table))
    .map((table) => classifyTable(table, DESKTOP_ONLY_TABLES));
  const androidOnly = [...androidTables]
    .filter((table) => !desktopTables.has(table))
    .map((table) => classifyTable(table, ANDROID_ONLY_TABLES));
  const shared = CORE_TABLES.filter((table) => desktopTables.has(table) && androidTables.has(table))
    .map((table) => compareTable(table, desktop.tables[table], android.tables[table]))
    .filter((entry) => entry.differences.length > 0);
  return {
    androidOnly,
    desktopOnly,
    shared,
    unattributed: [
      ...desktopOnly.filter((entry) => entry.classification === 'unattributed'),
      ...androidOnly.filter((entry) => entry.classification === 'unattributed'),
      ...shared
        .map((entry) => ({
          ...entry,
          differences: entry.differences.filter((difference) => difference.classification === 'unattributed')
        }))
        .filter((entry) => entry.differences.length > 0)
    ]
  };
}

function classifyTable(table, knownSet) {
  return {
    classification: classifyTableName(table, knownSet),
    table
  };
}

function compareTable(table, desktopTable, androidTable) {
  const differences = [];
  pushMapDiff(differences, table, 'columns', desktopTable.columns, androidTable.columns);
  pushMapDiff(differences, table, 'indexes', desktopTable.indexes, androidTable.indexes);
  if (desktopTable.createSql !== androidTable.createSql) {
    differences.push(classifyDifference({
      desktop: desktopTable.createSql,
      field: 'createSql',
      table,
      android: androidTable.createSql
    }));
  }
  return { differences, table };
}

function pushMapDiff(differences, table, field, desktopMap, androidMap) {
  const keys = new Set([...Object.keys(desktopMap), ...Object.keys(androidMap)]);
  for (const key of [...keys].sort()) {
    const desktop = desktopMap[key] ?? null;
    const android = androidMap[key] ?? null;
    if (JSON.stringify(desktop) !== JSON.stringify(android)) {
      differences.push(classifyDifference({ android, desktop, field: `${field}.${key}`, table }));
    }
  }
}

function classifyDifference(difference) {
  const qualified = `${difference.table}.${difference.field}`;
  return {
    ...difference,
    classification: classifyDifferenceField(qualified)
  };
}

function buildInventory(statements) {
  const database = new Database(':memory:');
  try {
    for (const statement of statements) {
      database.exec(statement);
    }
    const tables = {};
    const rows = database
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all();
    for (const row of rows) {
      tables[row.name] = {
        columns: loadColumns(database, row.name),
        createSql: normalizeSql(row.sql),
        indexes: loadIndexes(database, row.name)
      };
    }
    return { tables };
  } finally {
    database.close();
  }
}

function loadColumns(database, table) {
  return Object.fromEntries(
    database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((column) => [
      column.name,
      {
        defaultValue: column.dflt_value ?? null,
        notNull: column.notnull === 1,
        pk: column.pk,
        type: column.type
      }
    ])
  );
}

function loadIndexes(database, table) {
  const indexes = {};
  for (const index of database.prepare(`PRAGMA index_list(${quoteIdentifier(table)})`).all()) {
    indexes[index.name] = {
      columns: database.prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`).all().map((row) => row.name),
      origin: index.origin,
      partial: index.partial === 1,
      unique: index.unique === 1
    };
  }
  return indexes;
}

function summarizeJavaSharedDdl(inventory) {
  return Object.keys(inventory.tables)
    .sort()
    .map((table) => classifyTable(table, ANDROID_ONLY_TABLES));
}

function extractStatementsFromArray(source, name) {
  return extractStatementsFromBody(extractArrayBody(source, name), {});
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function readRepoFile(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(buildSchemaDriftReport(), null, 2));
}
