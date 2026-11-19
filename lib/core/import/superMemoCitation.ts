import type { NativeSuperMemoPreviewRow } from '../../platform/nativeSuperMemoImportContract.js';

import type { SuperMemoBibliography } from './superMemoBibliography.js';
import { addSuperMemoSource, formatMappedSuperMemoSource, formatSuperMemoSource, type SuperMemoSourceFormat } from './superMemoSourceFormatting.js';

export interface SuperMemoCitation {
  field: 'content' | 'reveal';
  placement: SuperMemoSourceFormat['placement'];
  text: string;
}

type Row = NativeSuperMemoPreviewRow;

export function superMemoCitationOrigin(row: Row, rows: ReadonlyMap<number, Row>) {
  if (row.sourceArticleId !== undefined) {
    return row.sourceArticleId === row.id ? undefined : rows.get(row.sourceArticleId ?? 0);
  }
  for (let id = row.parentId; id !== null;) {
    const parent = rows.get(id);
    if (!parent) break;
    if (parent.outcome === 'topic' && parent.sourceBibliography) return parent;
    id = parent.parentId;
  }
}

function bibliographyDifferences(value: SuperMemoBibliography | undefined, origin: SuperMemoBibliography | undefined) {
  if (!value || !origin) return value;
  return Object.fromEntries((Object.keys(value) as Array<keyof SuperMemoBibliography>)
    .filter(key => value[key]?.trim() !== origin[key]?.trim())
    .map(key => [key, value[key]]));
}

export function describeSuperMemoCitation(row: NativeSuperMemoPreviewRow, parent: NativeSuperMemoPreviewRow | undefined,
  article: { id: string; title: string } | undefined, format: SuperMemoSourceFormat, origin?: Row): SuperMemoCitation | null {
  if (row.outcome !== 'topic' && row.outcome !== 'item') return null;
  if (format.referenceMap) {
    const derived = Boolean(origin || (row.sourceArticleId && row.sourceArticleId !== row.id) || row.outcome === 'item');
    const placement = derived ? 'content-end' : 'metadata';
    const bibliography = bibliographyDifferences(row.sourceBibliography,
      origin?.outcome === 'topic' ? origin.sourceBibliography : undefined);
    const text = formatMappedSuperMemoSource(bibliography, null, format.referenceMap, placement);
    return text ? { field: 'content', placement, text } : null;
  }
  const text = formatSuperMemoSource(row.sourceBibliography, row.sourceArticleId, article, format);
  if (!text) return null;
  if (format.placement === 'content-end' ||
      (row.outcome === 'topic' && (format.placement !== 'topic-info' || parent?.outcome !== 'topic'))) {
    return { field: 'content', placement: format.placement, text };
  }
  return row.outcome === 'item' && (format.placement === 'metadata' || format.placement === 'body')
    ? { field: 'reveal', placement: format.placement, text } : null;
}

export function addSuperMemoCitation(value: string, citation: SuperMemoCitation | null, field: SuperMemoCitation['field']) {
  return citation?.field === field && (value || citation.placement === 'metadata') ? addSuperMemoSource(value, citation.text, citation.placement) : value;
}
