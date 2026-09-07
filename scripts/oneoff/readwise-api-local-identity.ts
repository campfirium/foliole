import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import {
  resolveReaderBodyAncestor,
  type ReaderDocumentContract
} from '../../lib/core/readwise/readwiseApiContract.js';

interface SourceRow {
  latest_node_id: string | null;
  source_kind: string;
  source_location: string | null;
  type_settings_json: string;
}

const READER_LINK = /https?:\/\/read\.readwise\.io\/(?:[^\s/()]+\/)?read\/([A-Za-z0-9_-]+)/giu;

export function auditLocalIdentity(
  databasePath: string,
  sourceRoot: string,
  documents: ReaderDocumentContract[]
) {
  const database = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    const rows = database.prepare(`SELECT i.latest_node_id, i.source_kind, i.source_location, d.type_settings_json
      FROM import_sources i JOIN desktop_sources d ON d.source_ref = i.source_ref
      WHERE d.source_type = 'readwise' ORDER BY i.source_fingerprint`).all() as SourceRow[];
    return summarizeSources(rows, sourceRoot, documents);
  } finally {
    database.close();
  }
}

function summarizeSources(rows: SourceRow[], sourceRoot: string, documents: ReaderDocumentContract[]) {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const counts: Record<string, number> = { candidate: 0, fullDocumentOnly: 0, noCandidate: 0, rawLinks: 0, total: rows.length };
  const remote: Record<string, number> = { conflicts: 0, missing: 0, resolved: 0 };
  for (const row of rows) {
    const files = resolveSourceFiles(sourceRoot, row);
    const rawIds = extractIds(files.raw);
    const fullIds = extractIds(files.full);
    const ids = rawIds.length ? rawIds : fullIds;
    counts.rawLinks += rawIds.length;
    if (ids.length) counts.candidate += 1;
    else counts.noCandidate += 1;
    if (!rawIds.length && fullIds.length) counts.fullDocumentOnly += 1;
    const ancestors = new Set<string>();
    let missing = false;
    for (const id of ids) {
      const result = resolveReaderBodyAncestor(id, byId);
      if (!result.documentId) missing = true;
      else ancestors.add(result.documentId);
    }
    if (!ids.length || missing) remote.missing += 1;
    else if (ancestors.size === 1) remote.resolved += 1;
    else remote.conflicts += 1;
  }
  return { localCandidates: counts, remoteResolution: remote };
}

function resolveSourceFiles(sourceRoot: string, row: SourceRow) {
  const settings = parseSettings(row.type_settings_json);
  const category = ({ articles: 'Articles', books: 'Books', podcasts: 'Podcasts', tweets: 'Tweets' } as const)[settings.kind];
  if (!category || !row.source_location) return { full: '', raw: '' };
  return {
    full: readText(path.join(sourceRoot, 'Full Document Contents', category, row.source_location)),
    raw: readText(path.join(sourceRoot, category, row.source_location))
  };
}

function parseSettings(value: string): { kind: 'articles' | 'books' | 'podcasts' | 'tweets' | null } {
  try {
    const kind = (JSON.parse(value) as { kind?: unknown }).kind;
    return { kind: kind === 'articles' || kind === 'books' || kind === 'podcasts' || kind === 'tweets' ? kind : null };
  } catch {
    return { kind: null };
  }
}

function readText(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function extractIds(value: string) {
  return [...new Set([...value.matchAll(READER_LINK)].map((match) => match[1]).filter((id): id is string => Boolean(id)))];
}
