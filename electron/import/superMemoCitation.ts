import { addSuperMemoSource, formatSuperMemoSource, type SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import type { NativeSuperMemoPreviewRow } from '../../lib/platform/nativeSuperMemoImportContract.js';

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

export function removeSuperMemoCitation(value: string, { placement, text }: SuperMemoCitation) {
  if (placement === 'body' || placement === 'content-end') {
    const suffix = '\n\n' + text;
    const start = value.lastIndexOf(suffix);
    const end = start + suffix.length;
    return start >= 0 && value.indexOf(suffix) === start && (end === value.length || value.startsWith('\n\n', end))
      ? value.slice(0, start) + value.slice(end) : null;
  }
  const frontMatter = /^---\n([\s\S]*?)\n---(?=\n|$)/u.exec(value);
  if (!frontMatter) return null;
  const header = frontMatter[1]!;
  const start = header.lastIndexOf(text);
  const end = start + text.length;
  if (start < 0 || header.indexOf(text) !== start ||
      (start > 0 && header[start - 1] !== '\n') || (end < header.length && header[end] !== '\n')) return null;
  const remaining = [header.slice(0, start).replace(/\n$/u, ''), header.slice(end).replace(/^\n/u, '')].filter(Boolean).join('\n');
  const body = value.slice(frontMatter[0].length);
  return remaining ? `---\n${remaining}\n---${body}` : body.replace(/^\n\n/u, '');
}
