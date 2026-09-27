import type { FtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';
import { findSearchAliasSpans } from '../../lib/core/database/searchAliasEvidence.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';

import type { ReadwiseExternalDocumentRow } from './readwiseExternalDocumentRows.js';

export function toReadwiseSearchResult(args: {
  absolutePath: string;
  folderPath: string;
  importedNodeId: string | null;
  plan: FtsSearchQueryPlan;
  row: ReadwiseExternalDocumentRow;
}) {
  const { absolutePath, folderPath, importedNodeId, plan, row } = args;
  const externalMatch = {
    absolutePath,
    folderId: row.folder_id,
    folderPath,
    importedNodeId,
    query: plan.highlightQuery,
    relativePath: row.relative_path,
    sourceKind: 'external' as const
  };
  const bodySpans = findSearchAliasSpans(row.content, plan.aliasSpellings);
  const metadataSpans = findSearchAliasSpans(`${row.file_name} ${row.relative_path}`, plan.aliasSpellings);
  const aliasMatches = plan.aliasSpellings.flatMap((spelling) => {
    const body = bodySpans.find((span) => span.spelling === spelling);
    const metadata = metadataSpans.find((span) => span.spelling === spelling);
    if (!body && !metadata) return [];
    const start = Math.max(0, (body?.from ?? 0) - 36);
    return [{
      excerpt: body ? row.content.slice(start, body.to + 36).replace(/\s+/gu, ' ') : row.opening_text ?? '',
      externalMatch: { ...externalMatch, query: body?.query ?? '' },
      nodeMatch: null,
      pdfMatch: null,
      spelling
    }];
  });
  const primary = aliasMatches.find((item) => plan.triggerSpellings.includes(item.spelling)) ?? aliasMatches[0];
  return {
    aliasMatches: aliasMatches.length ? aliasMatches : undefined,
    excerpt: primary?.excerpt ?? row.opening_text ?? resolveNodeOpeningText(row.content, row.title) ?? '',
    externalMatch: primary?.externalMatch ?? externalMatch,
    id: absolutePath,
    kind: 'external' as const,
    matchedOriginal: aliasMatches.some((item) => plan.triggerSpellings.includes(item.spelling)),
    nodeMatch: null,
    pdfMatch: null,
    title: row.file_name,
    updatedAt: row.source_modified_at
  };
}
