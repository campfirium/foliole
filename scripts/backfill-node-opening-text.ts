import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const LIBRARY_HOME_DEFAULT_DIRNAME = 'Foliole';
const LIBRARY_DATA_DIRNAME = 'Data';
const LIBRARY_DATABASE_FILENAME = 'foliole.db';
const NODE_OPENING_PREVIEW_MAX_LENGTH = 200;
const NODE_OPENING_PREVIEW_FALLBACK = 'No opening yet.';
const PDF_READER_PLACEHOLDER_TEXT = 'Linked PDF source ready for the reader surface.';

const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const WIKILINK_WRAPPER_PATTERN = /\[\[([^\]]+)\]\]/g;
const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;
const OPENING_PREVIEW_IGNORED_VALUES = new Set([
  'cover',
  'cover image',
  'title page',
  '封面',
  PDF_READER_PLACEHOLDER_TEXT.toLocaleLowerCase()
]);

type SqliteDatabase = import('better-sqlite3').Database;

interface NodeRow {
  content: string;
  id: string;
  kind: string | null;
  parent_id: string | null;
  title: string;
}

interface NodeOrderRow {
  node_id: string;
}

interface PdfOpeningRow {
  node_id: string;
  text: string;
}

interface StoredLibraryPathSettings {
  library_home?: unknown;
}

type NodeRecord = {
  kind: string | null;
  openingText: string | null;
  parentNodeId: string | null;
  title: string;
};

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
  const settingsPath = path.join(userDataPath, 'config', 'library-path-settings.json');
  const overrides = readStoredLibraryPathSettings(settingsPath);
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

function resolveBackfilledNodeOpeningTextById(input: {
  nodeOrderRows: NodeOrderRow[];
  nodeRows: NodeRow[];
  pdfOpeningRows: PdfOpeningRow[];
}) {
  const nodesById: Record<string, NodeRecord> = {};
  const directOpeningById = new Map<string, string | null>();

  for (const row of input.nodeRows) {
    const directOpening = row.kind === 'folder' ? null : resolveNodeOpeningText(row.content, row.title);
    directOpeningById.set(row.id, directOpening);
    nodesById[row.id] = {
      kind: row.kind,
      openingText: null,
      parentNodeId: row.parent_id,
      title: row.title
    };
  }

  const nodeOrder = input.nodeOrderRows.map((row) => row.node_id).filter((nodeId) => Boolean(nodesById[nodeId]));
  const orderedNodeIds = new Set(nodeOrder);
  for (const row of input.nodeRows) {
    if (!orderedNodeIds.has(row.id)) {
      nodeOrder.push(row.id);
    }
  }

  applyResolvedOpenings({
    directOpeningById,
    nodeOrder,
    nodesById,
    pdfOpeningById: buildPdfOpeningById(input.pdfOpeningRows, nodesById)
  });

  return new Map(
    Object.entries(nodesById).map(([nodeId, node]) => [nodeId, node.openingText ?? null] as const)
  );
}

function buildPdfOpeningById(pdfOpeningRows: PdfOpeningRow[], nodesById: Record<string, NodeRecord>) {
  const pdfOpeningById = new Map<string, string>();
  for (const row of pdfOpeningRows) {
    if (pdfOpeningById.has(row.node_id)) {
      continue;
    }
    const node = nodesById[row.node_id];
    if (!node || typeof row.text !== 'string' || row.text.trim().length === 0) {
      continue;
    }
    const opening = extractNodeOpeningPreview(row.text, String(node.title ?? ''));
    if (isUsableOpening(opening)) {
      pdfOpeningById.set(row.node_id, opening);
    }
  }
  return pdfOpeningById;
}

function applyResolvedOpenings(input: {
  directOpeningById: Map<string, string | null>;
  nodeOrder: string[];
  nodesById: Record<string, NodeRecord>;
  pdfOpeningById: Map<string, string>;
}) {
  const childrenByParentId = buildChildrenByParentId(input.nodeOrder, input.nodesById);
  const resolvedOpeningById = new Map<string, string | null>();

  const resolveNodeOpening = (nodeId: string, visiting = new Set<string>()): string | null => {
    if (resolvedOpeningById.has(nodeId)) {
      return resolvedOpeningById.get(nodeId) ?? null;
    }
    if (visiting.has(nodeId)) {
      return null;
    }
    visiting.add(nodeId);
    const node = input.nodesById[nodeId];
    if (!node || node.kind === 'folder') {
      resolvedOpeningById.set(nodeId, null);
      visiting.delete(nodeId);
      return null;
    }

    const directOpening = input.directOpeningById.get(nodeId);
    if (isUsableOpening(directOpening)) {
      const resolvedDirectOpening = directOpening ?? null;
      resolvedOpeningById.set(nodeId, resolvedDirectOpening);
      visiting.delete(nodeId);
      return resolvedDirectOpening;
    }

    const pdfOpening = input.pdfOpeningById.get(nodeId);
    if (pdfOpening) {
      resolvedOpeningById.set(nodeId, pdfOpening);
      visiting.delete(nodeId);
      return pdfOpening;
    }

    const firstNestedChildNodeId = resolveFirstNestedChildNodeId(nodeId, childrenByParentId);
    if (firstNestedChildNodeId) {
      const childOpening = resolveNodeOpening(firstNestedChildNodeId, visiting);
      if (childOpening) {
        resolvedOpeningById.set(nodeId, childOpening);
        visiting.delete(nodeId);
        return childOpening;
      }
    }

    resolvedOpeningById.set(nodeId, null);
    visiting.delete(nodeId);
    return null;
  };

  for (const nodeId of input.nodeOrder) {
    input.nodesById[nodeId].openingText = resolveNodeOpening(nodeId);
  }
}

function resolveFirstNestedChildNodeId(nodeId: string, childrenByParentId: Map<string, string[]>) {
  const branchChildNodeId = (childrenByParentId.get(nodeId) ?? []).find(
    (childNodeId) => (childrenByParentId.get(childNodeId)?.length ?? 0) > 0
  );
  if (!branchChildNodeId) {
    return null;
  }
  return childrenByParentId.get(branchChildNodeId)?.[0] ?? null;
}

function buildChildrenByParentId(nodeOrder: string[], nodesById: Record<string, NodeRecord>) {
  const childrenByParentId = new Map<string, string[]>();
  for (const nodeId of nodeOrder) {
    const parentNodeId = nodesById[nodeId]?.parentNodeId ?? null;
    if (!parentNodeId) {
      continue;
    }
    const children = childrenByParentId.get(parentNodeId) ?? [];
    children.push(nodeId);
    childrenByParentId.set(parentNodeId, children);
  }
  return childrenByParentId;
}

function isUsableOpening(opening: string | null | undefined) {
  return Boolean(opening && opening !== NODE_OPENING_PREVIEW_FALLBACK);
}

function resolveNodeOpeningText(content: string, title: string) {
  const opening = extractNodeOpeningPreview(content, title);
  return opening === NODE_OPENING_PREVIEW_FALLBACK ? null : opening;
}

function extractNodeOpeningPreview(content: string, title: string) {
  const paragraphs = getNormalizedParagraphs(content);
  if (paragraphs.length === 0) {
    return NODE_OPENING_PREVIEW_FALLBACK;
  }

  const normalizedTitle = normalizeText(title);
  const strippedOpening =
    paragraphs
      .map((paragraph) => stripLeadingTitleEcho(paragraph, normalizedTitle))
      .find((paragraph) => !isIgnoredOpeningValue(paragraph)) ?? '';
  const opening = strippedOpening || NODE_OPENING_PREVIEW_FALLBACK;

  return truncatePreview(opening);
}

function getNormalizedParagraphs(content: string) {
  return stripLeadingTitleHeading(stripLeadingFrontmatter(content))
    .replace(ANCHOR_TAG_PATTERN, '')
    .split(/\r?\n\r?\n/)
    .map((paragraph) =>
      stripMarkdownInline(
        paragraph
          .split(/\r?\n/)
          .map((line) => stripMarkdownLinePrefix(line))
          .join(' ')
      )
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

function stripLeadingFrontmatter(content: string) {
  const lines = content.split('\n');
  if (lines.length < 3 || !FRONTMATTER_DELIMITER_PATTERN.test(lines[0] ?? '')) {
    return content;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (FRONTMATTER_DELIMITER_PATTERN.test(lines[index] ?? '')) {
      return lines.slice(index + 1).join('\n');
    }
  }

  return content;
}

function stripLeadingTitleHeading(content: string) {
  const lines = content.split(/\r?\n/);
  const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstNonEmptyLineIndex < 0) {
    return content;
  }

  const firstNonEmptyLine = lines[firstNonEmptyLineIndex]?.trim() ?? '';
  if (!/^#\s+/.test(firstNonEmptyLine)) {
    return content;
  }

  return lines.slice(firstNonEmptyLineIndex + 1).join('\n').trimStart();
}

function stripMarkdownLinePrefix(line: string) {
  return line
    .trim()
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s+/, '');
}

function stripMarkdownInline(value: string) {
  return value
    .replace(WIKILINK_WRAPPER_PATTERN, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]+/g, '');
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function stripLeadingTitleEcho(paragraph: string, normalizedTitle: string) {
  let nextParagraph = paragraph;
  const lowerTitle = normalizedTitle.toLocaleLowerCase();

  while (normalizedTitle && nextParagraph.toLocaleLowerCase().startsWith(lowerTitle)) {
    nextParagraph = nextParagraph.slice(normalizedTitle.length).replace(/^[\s:：,-]+/, '').trim();
  }

  return nextParagraph;
}

function isIgnoredOpeningValue(value: string) {
  const normalizedValue = normalizeText(value).toLocaleLowerCase();
  return normalizedValue.length === 0 || OPENING_PREVIEW_IGNORED_VALUES.has(normalizedValue);
}

function truncatePreview(value: string) {
  if (value.length <= NODE_OPENING_PREVIEW_MAX_LENGTH) {
    return value;
  }

  const slicedValue = value.slice(0, NODE_OPENING_PREVIEW_MAX_LENGTH).trimEnd();
  const lastSpaceIndex = slicedValue.lastIndexOf(' ');
  const safeValue = lastSpaceIndex >= 60 ? slicedValue.slice(0, lastSpaceIndex) : slicedValue;
  return `${safeValue.trimEnd()}…`;
}

main();
