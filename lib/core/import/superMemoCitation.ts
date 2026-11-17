import type { NativeSuperMemoPreviewRow } from '../../platform/nativeSuperMemoImportContract.js';

import { addSuperMemoSource, formatSuperMemoSource, type SuperMemoSourceFormat } from './superMemoSourceFormatting.js';

export interface SuperMemoCitation {
  field: 'content' | 'reveal';
  placement: SuperMemoSourceFormat['placement'];
  text: string;
}

export function describeSuperMemoCitation(row: NativeSuperMemoPreviewRow, parent: NativeSuperMemoPreviewRow | undefined,
  article: { id: string; title: string } | undefined, format: SuperMemoSourceFormat): SuperMemoCitation | null {
  const text = formatSuperMemoSource(row.sourceBibliography, row.sourceArticleId, article, format);
  if (!text || (row.outcome !== 'item' && row.outcome !== 'topic')) return null;
  if (format.placement === 'content-end' ||
      (row.outcome === 'topic' && (format.placement !== 'topic-info' || parent?.outcome !== 'topic'))) {
    return { field: 'content', placement: format.placement, text };
  }
  return row.outcome === 'item' && (format.placement === 'metadata' || format.placement === 'body')
    ? { field: 'reveal', placement: format.placement, text } : null;
}

export function addSuperMemoCitation(value: string, citation: SuperMemoCitation | null, field: SuperMemoCitation['field']) {
  return value && citation?.field === field ? addSuperMemoSource(value, citation.text, citation.placement) : value;
}
