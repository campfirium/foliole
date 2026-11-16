import { convertSuperMemoContent } from '../../lib/core/import/superMemoContent.js';
import { orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../lib/core/import/superMemoImportParents.js';
import type { SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';

import { formatSuperMemoMaterialSource } from './superMemoMaterialSource.js';

export interface PendingParentContent {
  expectedImages: ReadonlyMap<string, string | null>;
  sourceFormat: SuperMemoSourceFormat;
}

export function createPendingParentRenderer(elements: SuperMemoXmlDraftElement[], preview: NativeSuperMemoPreview, content: PendingParentContent) {
  const rows = orderSuperMemoSourceRows(preview.rows);
  const parents = planSuperMemoImportParents(rows);
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const byId = new Map(elements.map(element => [element.id, element]));
  const destinations = new Map([...content.expectedImages].flatMap(([source, key]) =>
    key ? [[source, buildAssetMarkdownUrl(key)] as const] : []));
  return (sourceId: number, existing: ReadonlyMap<number, string>, additions: ReadonlyMap<number, unknown>, required: ReadonlySet<number>) => {
    const row = rowsById.get(sourceId);
    const element = byId.get(sourceId);
    if (!row || !element || row.outcome !== 'topic') return undefined;
    const article = rowsById.get(row.sourceArticleId ?? 0);
    if (article && required.has(article.id) && !existing.has(article.id) && !additions.has(article.id)) return undefined;
    // A newly created article gets a UUID at write time. Only the link width affects a following text range.
    const articleId = article && (existing.get(article.id) ?? (additions.has(article.id) ? '00000000-0000-4000-8000-000000000000' : undefined));
    const body = convertSuperMemoContent(element.bodyOrQuestionHtml, destinations).content;
    return formatSuperMemoMaterialSource(row, rowsById.get(parents.get(sourceId) ?? 0),
      article && articleId ? { id: articleId, title: article.title } : undefined, content.sourceFormat, body).content;
  };
}
