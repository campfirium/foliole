import { createHash } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { loadWorkspaceNodeDocument } from '../../lib/core/database/workspaceNodeDocument.js';
import { findSuperMemoClozeLocator } from '../../lib/core/import/superMemoClozeLocator.js';
import { findSuperMemoHighlightLocator } from '../../lib/core/import/superMemoHighlightLocator.js';
import { prepareSuperMemoParentText } from '../../lib/core/import/superMemoParentText.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';

import type { BatchEntry } from './applySuperMemoBatchStructure.js';
import { findUniqueAnchorText, type ReparentedSuperMemoAnchor } from './superMemoAnchorReparent.js';
import { removeSuperMemoCitation } from './superMemoCitation.js';
import { previewSuperMemoMarkdown } from './superMemoTextUpdate.js';

function matchesImportedText(entry: BatchEntry, field: 'content' | 'reveal', live: string, rendered: string) {
  const hash = entry.importedText?.[field];
  const citation = entry.importedCitation;
  const plain = citation?.field === field ? removeSuperMemoCitation(live, citation) : live;
  return Boolean(hash && plain !== null && hashTextBody(plain) === hash && hashTextBody(rendered) === hash);
}

export function createSuperMemoMissingAnchorPlanner(driver: DatabaseDriver, elements: SuperMemoXmlDraftElement[],
  expectedImages: ReadonlyMap<string, string | null>) {
  const byId = new Map(elements.map(element => [element.id, element]));
  const render = previewSuperMemoMarkdown(expectedImages);
  const sourceTexts = new Map<number, ReturnType<typeof prepareSuperMemoParentText>>();
  return (entry: BatchEntry, sourceParent: number, parentId: string): ReparentedSuperMemoAnchor | null => {
    const child = byId.get(entry.id);
    const parent = byId.get(sourceParent);
    if (!child || !parent || !entry.nodeId || entry.importedAnchorLink !== null ||
        (entry.outcome !== 'topic' && entry.outcome !== 'item')) return null;
    const live = loadWorkspaceNodeDocument(driver, entry.nodeId);
    const target = loadWorkspaceNodeDocument(driver, parentId);
    if (!live || target?.kind !== 'topic' || !matchesImportedText(entry, 'content', live.content, render(child.bodyOrQuestionHtml))) return null;
    const kind = entry.outcome === 'topic' ? 'highlight' : 'cloze';
    const answer = kind === 'cloze' ? render(child.answerHtml) : '';
    if (kind === 'cloze' && !matchesImportedText(entry, 'reveal', live.reveal ?? '', answer)) return null;
    let source = sourceTexts.get(sourceParent);
    if (!source) {
      source = prepareSuperMemoParentText(render(parent.bodyOrQuestionHtml));
      sourceTexts.set(sourceParent, source);
    }
    const suggested = kind === 'highlight' ? findSuperMemoHighlightLocator(source, child.bodyOrQuestionHtml)
      : findSuperMemoClozeLocator(source, child.bodyOrQuestionHtml, answer);
    if (!suggested) return null;
    const locator = findUniqueAnchorText(prepareSuperMemoParentText(target.content), suggested.originalText);
    if (!locator) return null;
    const key = createHash('sha256').update(entry.nodeId).digest('hex').slice(0, 24);
    const clean = driver.queryOne('SELECT id FROM nodes WHERE id = ? AND sync_dirty = 0', [parentId]);
    return { link: { id: `anchor-supermemo-${key}`, kind, locator }, sourceVersionId: clean ? target.currentVersionId : null };
  };
}
