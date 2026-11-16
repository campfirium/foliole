import { addSuperMemoSource, formatSuperMemoSource, type SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import type { NativeSuperMemoPreviewRow } from '../../lib/platform/nativeSuperMemoImportContract.js';

export function formatSuperMemoMaterialSource(row: NativeSuperMemoPreviewRow, parent: NativeSuperMemoPreviewRow | undefined,
  article: { id: string; title: string } | undefined, format: SuperMemoSourceFormat, body: string) {
  const formatted = formatSuperMemoSource(row.sourceBibliography, row.sourceArticleId, article, format);
  const inBody = format.placement === 'content-end' ||
    (row.outcome === 'topic' && (format.placement !== 'topic-info' || parent?.outcome !== 'topic'));
  return { formatted, content: inBody && body ? addSuperMemoSource(body, formatted, format.placement) : body };
}
