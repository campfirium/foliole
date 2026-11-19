import { orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../lib/core/import/superMemoImportParents.js';
import type { SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import { addSuperMemoReferenceHeading, superMemoReferenceHeading } from '../../lib/core/import/superMemoTopicTitle.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';

import { superMemoCitationOrigin } from './superMemoCitation.js';
import { formatSuperMemoMaterialSource } from './superMemoMaterialSource.js';
import { previewSuperMemoMarkdown } from './superMemoTextUpdate.js';

export interface PendingParentContent {
  expectedImages: ReadonlyMap<string, string | null>;
  sourceFormat: SuperMemoSourceFormat;
}

export function createPendingParentRenderer(elements: SuperMemoXmlDraftElement[], preview: NativeSuperMemoPreview, content: PendingParentContent) {
  const rows = orderSuperMemoSourceRows(preview.rows);
  const parents = planSuperMemoImportParents(rows);
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const byId = new Map(elements.map(element => [element.id, element]));
  const renderMarkdown = previewSuperMemoMarkdown(content.expectedImages);
  return (sourceId: number, existing: ReadonlyMap<number, string>, additions: ReadonlyMap<number, unknown>, saved: ReadonlyMap<number, { nodeId: string | null; outcome: string }>) => {
    const row = rowsById.get(sourceId);
    const element = byId.get(sourceId);
    if (!row || !element || row.outcome !== 'topic') return undefined;
    const article = rowsById.get(row.sourceArticleId ?? 0);
    if (article && article.outcome !== 'skipped' && saved.get(article.id)?.outcome === 'skipped' &&
        !existing.has(article.id) && !additions.has(article.id)) return undefined;
    // A newly created article gets a UUID at write time. Only the link width affects a following text range.
    const articleId = article && (existing.get(article.id) ?? (additions.has(article.id) ? '00000000-0000-4000-8000-000000000000' : undefined));
    const body = addSuperMemoReferenceHeading(renderMarkdown(element.bodyOrQuestionHtml), superMemoReferenceHeading(row));
    return formatSuperMemoMaterialSource(row, rowsById.get(parents.get(sourceId) ?? 0),
      article && articleId ? { id: articleId, title: article.title } : undefined, content.sourceFormat, body, superMemoCitationOrigin(row, rowsById)).content;
  };
}


export function listSuperMemoRequiredParents(rows: NativeSuperMemoPreview['rows'], parents: ReadonlyMap<number, number | null>,
  entries: ReadonlyMap<number, unknown>) {
  const required = new Set<number>();
  for (const row of rows) {
    if (!entries.has(row.id) || row.outcome === 'skipped') continue;
    for (let parent = parents.get(row.id); parent != null && !required.has(parent); parent = parents.get(parent)) {
      required.add(parent);
    }
  }
  return required;
}
