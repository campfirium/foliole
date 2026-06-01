import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { resolveBackfilledNodeOpeningTextById } from '../lib/core/database/nodeOpeningTextBackfill.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const LIBRARY_HOME_DEFAULT_DIRNAME = 'Foliole';
const LIBRARY_DATA_DIRNAME = 'Data';
const LIBRARY_DATABASE_FILENAME = 'foliole.db';

type SqliteDatabase = import('better-sqlite3').Database;

interface NodeRow {
  content: string;
  id: string;
  kind: string | null;
  parent_id: string | null;
  title: string;
}

interface StoredLibraryPathSettings {
  library_home?: unknown;
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const dbPath = resolveDatabasePath(flags);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`database not found: ${dbPath}`);
  }

  const sqlite = new BetterSqlite3(dbPath);
  try {
    const schema = inspectSchema(sqlite);
    ensureOpeningTextColumn(sqlite, schema.nodeColumns);
    const openingTextById = resolveBackfilledNodeOpeningTextById({
      nodeOrderRows: readNodeOrderRows(sqlite, schema.tableNames),
      nodeRows: readNodeRows(sqlite, schema.nodeColumns),
      pdfOpeningRows: readPdfOpeningRows(sqlite, schema.tableNames)
    });

    persistOpeningTexts(sqlite, openingTextById);
    console.log(`backfilled opening_text for ${openingTextById.size} nodes in ${dbPath}`);
  } finally {
    sqlite.close();
  }
}

function inspectSchema(sqlite: SqliteDatabase) {
  const nodeColumns = new Set(
    (sqlite.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>).map((column) => column.name)
  );
  const tableNames = new Set(
    (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
      (row) => row.name
    )
  );
  return { nodeColumns, tableNames };
}

function parseFlags(argv: string[]) {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) {
      throw new Error(`unexpected argument: ${token ?? '<empty>'}`);
    }
    const flagName = token.slice(2);
    const flagValue = argv[index + 1];
    if (!flagName || !flagValue || flagValue.startsWith('--')) {
      throw new Error(`missing value for --${flagName || 'flag'}`);
    }
    flags.set(flagName, flagValue);
    index += 1;
  }
  return flags;
}

function resolveDatabasePath(flags: Map<string, string>) {
  const explicitDbPath = flags.get('db-path')?.trim();
  if (explicitDbPath) {
    return path.resolve(explicitDbPath);
  }

  const userDataPath = resolveUserDataPath(flags);
  const documentsPath = resolveDocumentsPath(flags);
  const configPath = path.join(userDataPath, 'config');
  const overrides =
    readStoredLibraryPathSettings(path.join(configPath, 'current-library.json')) ??
    readStoredLibraryPathSettings(path.join(configPath, 'library-path-settings.json'));
  const libraryHome = normalizeAbsolutePath(overrides?.library_home) ?? path.join(documentsPath, LIBRARY_HOME_DEFAULT_DIRNAME);
  return path.join(libraryHome, LIBRARY_DATA_DIRNAME, LIBRARY_DATABASE_FILENAME);
}

function resolveUserDataPath(flags: Map<string, string>) {
  const explicitPath = flags.get('user-data-path')?.trim() || process.env.FOLIOLE_USER_DATA_PATH?.trim();
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const appDataRoot = resolveAppDataRoot();
  return path.join(appDataRoot, 'foliole');
}

function resolveDocumentsPath(flags: Map<string, string>) {
  const explicitPath = flags.get('documents-path')?.trim() || process.env.FOLIOLE_DOCUMENTS_PATH?.trim();
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  return path.join(os.homedir(), 'Documents');
}

function resolveAppDataRoot() {
  if (process.platform === 'win32') {
    return process.env.APPDATA ? path.resolve(process.env.APPDATA) : path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env.XDG_CONFIG_HOME ? path.resolve(process.env.XDG_CONFIG_HOME) : path.join(os.homedir(), '.config');
}

function readStoredLibraryPathSettings(settingsPath: string): StoredLibraryPathSettings | null {
  if (!fs.existsSync(settingsPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as StoredLibraryPathSettings;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeAbsolutePath(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed && path.isAbsolute(trimmed) ? path.normalize(trimmed) : null;
}

function ensureOpeningTextColumn(sqlite: SqliteDatabase, nodeColumns: Set<string>) {
  if (nodeColumns.has('opening_text')) {
    return;
  }
  sqlite.prepare('ALTER TABLE nodes ADD COLUMN opening_text TEXT').run();
}

function readNodeRows(sqlite: SqliteDatabase, nodeColumns: Set<string>) {
  const kindSelection = nodeColumns.has('kind') ? 'kind' : 'NULL AS kind';
  return sqlite
    .prepare(
      `SELECT id, parent_id, ${kindSelection}, title, content
       FROM nodes`
    )
    .all() as NodeRow[];
}

function readNodeOrderRows(sqlite: SqliteDatabase, tableNames: Set<string>) {
  if (!tableNames.has('node_order')) {
    return [];
  }
  return sqlite.prepare('SELECT node_id FROM node_order ORDER BY position ASC').all() as NodeOrderRow[];
}

function readPdfOpeningRows(sqlite: SqliteDatabase, tableNames: Set<string>) {
  if (!tableNames.has('node_attachments') || !tableNames.has('attachments') || !tableNames.has('pdf_page_text')) {
    return [];
  }
  return sqlite
    .prepare(
      `SELECT
         na.node_id,
         ppt.text
       FROM node_attachments na
       INNER JOIN attachments a
         ON a.id = na.attachment_id
       INNER JOIN pdf_page_text ppt
         ON ppt.attachment_id = a.id
       WHERE na.role = 'reference'
         AND a.mime_type = 'application/pdf'
       ORDER BY na.node_id ASC, ppt.page ASC`
    )
    .all() as PdfOpeningRow[];
}

function persistOpeningTexts(sqlite: SqliteDatabase, openingTextById: Map<string, string | null>) {
  const updateStatement = sqlite.prepare('UPDATE nodes SET opening_text = ? WHERE id = ?');
  const runInTransaction = sqlite.transaction(() => {
    for (const [nodeId, openingText] of openingTextById.entries()) {
      updateStatement.run(openingText, nodeId);
    }
  });
  runInTransaction();
}

main();
