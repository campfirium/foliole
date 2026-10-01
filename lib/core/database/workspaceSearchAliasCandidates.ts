import type { DatabaseDriver } from './driver.js';
import { matchesFtsSearchFields, type FtsSearchQueryPlan } from './ftsSearchQuery.js';
import { buildCrossPagePdfResult, buildNodeResult, buildPdfResult } from './workspaceSearchResultBuilders.js';
import { mergeRankedResults, sortAndLimitResults, type WorkspaceSearchPathQuality } from './workspaceSearchResults.js';
import {
  NODE_INDEX_COLUMNS, PDF_INDEX_COLUMNS, PDF_CROSS_PAGE_MATCH_SQL,
  type WorkspaceSearchRow, type WorkspacePdfSearchRow, type WorkspacePdfCrossPageSearchRow
} from './workspaceSearchSql.js';

type Candidate<Row> = Row & { quality: WorkspaceSearchPathQuality };
const QUALITY = { literal: 0, pair: 1, term: 2, fallback: 3 };

function readFtsCandidates<Row>(driver: DatabaseDriver, table: string, columns: string, plan: FtsSearchQueryPlan, weights: string) {
  const select = `SELECT ${columns}, bm25(${table}, ${weights}) AS rank`;
  const rows: Candidate<Row>[] = [];
  // Keep the original literal ranking while fetching both FTS branches together.
  try {
    rows.push(...driver.queryAll<Candidate<Row>>(`${select}, 'literal' AS quality
      FROM search.${table} WHERE ${table} MATCH ? UNION ALL
      ${select}, 'term' AS quality FROM search.${table} WHERE ${table} MATCH ? ORDER BY quality, rank ASC, updated_at DESC`,
    [plan.literalQuery, plan.advancedQuery]));
  } catch {
    // Each existing FTS branch may be unsupported independently (e.g. a short phrase).
    for (const [query, quality] of [[plan.literalQuery, 'literal'], [plan.advancedQuery, 'term']] as const) {
      try {
        rows.push(...driver.queryAll<Candidate<Row>>(`${select}, '${quality}' AS quality
          FROM search.${table} WHERE ${table} MATCH ?`, [query]));
      } catch { /* Preserve the existing unsupported-FTS behavior. */ }
    }
  }
  return rows;
}

function deduplicate<Row extends { rank: number }>(rows: Candidate<Row>[], key: (row: Candidate<Row>) => string) {
  const merged = new Map<string, Candidate<Row>>();
  for (const row of rows) {
    const id = key(row);
    const previous = merged.get(id);
    if (!previous || QUALITY[row.quality] < QUALITY[previous.quality]
      || (row.quality === previous.quality && Number(row.rank) < Number(previous.rank))) merged.set(id, row);
  }
  return [...merged.values()];
}

function nodeCandidates(driver: DatabaseDriver, plan: FtsSearchQueryPlan) {
  const clauses = plan.aliasSpellings.map(() => 'instr(lower(title), ?) > 0 OR instr(lower(content), ?) > 0');
  const rows = readFtsCandidates<WorkspaceSearchRow>(driver, 'node_search', NODE_INDEX_COLUMNS, plan, '8.0, 2.0, 1.0');
  rows.push(...driver.queryAll<Candidate<WorkspaceSearchRow>>(`SELECT ${NODE_INDEX_COLUMNS}, 500 AS rank, 'fallback' AS quality
    FROM search.node_search WHERE ${clauses.join(' OR ')}`, plan.aliasSpellings.flatMap((term) => [term, term])));
  return deduplicate(rows, (row) => row.id);
}

function pdfCandidates(driver: DatabaseDriver, plan: FtsSearchQueryPlan) {
  const rows = readFtsCandidates<WorkspacePdfSearchRow>(driver, 'pdf_search', PDF_INDEX_COLUMNS, plan, '4.0, 2.0, 1.0');
  const terms = [plan.normalizedQuery, ...plan.aliasSpellings];
  const clauses = terms.map(() => 'instr(lower(text), ?) > 0');
  rows.push(...driver.queryAll<Candidate<WorkspacePdfSearchRow>>(`SELECT ${PDF_INDEX_COLUMNS},
    CASE WHEN instr(lower(text), ?) > 0 THEN 100 ELSE 500 END AS rank, 'fallback' AS quality
    FROM search.pdf_search WHERE ${clauses.join(' OR ')}`, [plan.normalizedQuery, ...terms]));
  return deduplicate(rows, (row) => `${row.id}:${row.attachment_id}:${row.page}`);
}

function crossPageResults(driver: DatabaseDriver, plan: FtsSearchQueryPlan) {
  if (plan.normalizedQuery.length <= 1) return [];
  const length = plan.normalizedQuery.length - 1;
  return driver.queryAll<WorkspacePdfCrossPageSearchRow>(PDF_CROSS_PAGE_MATCH_SQL,
    [length, length, length, length, length, plan.normalizedQuery, plan.normalizedQuery])
    .map((row) => buildCrossPagePdfResult(row, plan.normalizedQuery));
}

export function searchAliasWorkspaceCandidates(driver: DatabaseDriver, plan: FtsSearchQueryPlan) {
  const nodes = nodeCandidates(driver, plan)
    .filter((row) => matchesFtsSearchFields(row.quality === 'fallback'
      ? [row.title, row.content] : [row.title, row.path, row.content], plan))
    .map((row) => buildNodeResult(row, plan.highlightQuery, row.quality, plan.aliasSpellings, plan.triggerSpellings, plan));
  const pages = pdfCandidates(driver, plan)
    .filter((row) => matchesFtsSearchFields(row.quality === 'fallback'
      ? [row.text] : [row.title, row.path, row.text], plan))
    .map((row) => buildPdfResult(row, plan.highlightQuery, row.quality, plan.aliasSpellings, plan.triggerSpellings, plan))
    .filter((row) => row !== null);
  return sortAndLimitResults(mergeRankedResults([...nodes, ...pages, ...crossPageResults(driver, plan)]));
}
