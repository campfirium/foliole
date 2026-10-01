import type { DatabaseDriver } from './driver.js';
import {
  type WorkspacePdfCrossPageSearchRow,
  type WorkspacePdfSearchRow,
  type WorkspaceSearchRow
} from './workspaceSearchSql.js';
import { NODE_INDEX_COLUMNS, PDF_INDEX_COLUMNS } from './workspaceSearchSql.js';

export function normalizeSearchHaystack(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function hasAllSearchTerms(value: string, terms: string[]) {
  const haystack = normalizeSearchHaystack(value);
  return terms.every((term) => haystack.includes(term));
}

export function nodeRowMatchesShortTerms(row: WorkspaceSearchRow, shortTerms: string[]) {
  return hasAllSearchTerms(`${row.title} ${row.content}`, shortTerms);
}

export function pdfRowMatchesShortTerms(row: WorkspacePdfSearchRow, shortTerms: string[]) {
  return hasAllSearchTerms(row.text, shortTerms);
}

export function crossPagePdfRowMatchesShortTerms(row: WorkspacePdfCrossPageSearchRow, shortTerms: string[]) {
  return hasAllSearchTerms(`${row.text} ${row.next_text}`, shortTerms);
}

export function loadShortTermNodeRows(driver: DatabaseDriver, shortTerms: string[]) {
  const clauses = shortTerms.map(() => "instr(lower(title || ' ' || content), ?) > 0");
  return driver.queryAll<WorkspaceSearchRow>(`SELECT ${NODE_INDEX_COLUMNS}, 200 AS rank
    FROM search.node_search WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC`, shortTerms);
}

export function loadShortTermPdfRows(driver: DatabaseDriver, shortTerms: string[]) {
  const clauses = shortTerms.map(() => 'instr(lower(text), ?) > 0');
  return driver.queryAll<WorkspacePdfSearchRow>(`SELECT ${PDF_INDEX_COLUMNS}, 200 AS rank
    FROM search.pdf_search WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC`, shortTerms);
}
