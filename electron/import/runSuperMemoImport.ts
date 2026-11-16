import { randomUUID } from 'node:crypto';

import { IMPORTED_REVIEW_NODE_PREFIX } from '../../lib/core/database/initialReviewSchedule.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { findSuperMemoClozeLocator } from '../../lib/core/import/superMemoClozeLocator.js';
import { findSuperMemoHighlightLocator } from '../../lib/core/import/superMemoHighlightLocator.js';
import { orderSuperMemoImportWrites, orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../lib/core/import/superMemoImportParents.js';
import { prepareSuperMemoParentText, type SuperMemoParentText } from '../../lib/core/import/superMemoParentText.js';
import { superMemoFullOffset } from '../../lib/core/import/superMemoScheduleOffset.js';
import { blendSuperMemoDue, DEFAULT_SUPER_MEMO_GRADE_MAP, SUPER_MEMO_CONVERSION_RULE_VERSION, type SuperMemoGradeMap } from '../../lib/core/import/superMemoSchedulePreview.js';
import type { SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { createInitialNewItemReviewProfile } from '../../lib/core/review/newItemReviewSlots.js';
import type { ReviewSchedulerSettings } from '../../lib/core/review/settings.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { replaceNodeImageResourceReferences } from '../database/nodeResources.js';

import { prepareSuperMemoTopicContent } from './prepareSuperMemoTopicContent.js';
import { superMemoBatchKey } from './superMemoBatchKey.js';
import { addSuperMemoCitation, type SuperMemoCitation } from './superMemoCitation.js';
import { importSuperMemoReviewHistory, superMemoDueInstant, superMemoTopicReading } from './superMemoImportSchedule.js';
import { formatSuperMemoMaterialSource } from './superMemoMaterialSource.js';
import { persistSuperMemoTopic } from './writeSuperMemoTopic.js';

type Row = NativeSuperMemoPreview['rows'][number];
type Prepared = Awaited<ReturnType<typeof prepareSuperMemoTopicContent>>;
type Snapshot = Parameters<typeof upsertNodeSnapshot>[0];

function persistElement(snapshot: Snapshot, element: SuperMemoXmlDraftElement, body: Prepared, answer: Prepared,
  due: string | null, offset: string, sourceState: Row['sourceState'], gradeMap: SuperMemoGradeMap) {
  if (snapshot.kind === 'topic') {
    persistSuperMemoTopic({ ...snapshot, reading: sourceState === 'pending' ? null
      : superMemoTopicReading(element, due, snapshot.priority ?? 5, snapshot.createdAt, sourceState === 'dismissed') }, body);
  } else if (snapshot.kind === 'item') {
    upsertNodeSnapshot({ ...snapshot, content: body.content, reveal: answer.content,
      ...(sourceState === 'dismissed' ? { reading: superMemoTopicReading(element, null, snapshot.priority ?? 5, snapshot.createdAt, true) } : {}),
      ...(due ? { review: createInitialNewItemReviewProfile(superMemoDueInstant(due)) } : {}) });
    const images = [...body.resourceReferences, ...answer.resourceReferences];
    if (images.length) replaceNodeImageResourceReferences(snapshot.nodeId, images);
    if (sourceState !== 'pending' && body.content && answer.content) importSuperMemoReviewHistory(element, snapshot.nodeId, offset, gradeMap);
  } else {
    upsertNodeSnapshot(snapshot);
  }
}

export async function prepareSuperMemoRows(rows: Row[], elements: Map<number, SuperMemoXmlDraftElement>, directory?: string,
  expectedImages?: ReadonlyMap<string, string | null>) {
  const empty: Prepared = { content: '', resourceReferences: [], unresolvedImages: [] };
  const prepared = [];
  for (const row of rows) {
    const element = elements.get(row.id)!;
    const body = row.outcome === 'topic' || row.outcome === 'item'
      ? await prepareSuperMemoTopicContent(element.bodyOrQuestionHtml, directory, expectedImages) : empty;
    const answer = row.outcome === 'item' ? await prepareSuperMemoTopicContent(element.answerHtml, directory, expectedImages) : empty;
    prepared.push({ row, element, body, answer });
  }
  return prepared;
}

type PreparedRows = Awaited<ReturnType<typeof prepareSuperMemoRows>>;

function importedTextReceipt(kind: Row['outcome'], content: string, reveal: string) {
  if (kind === 'topic') return { importedText: { content: hashTextBody(content) } };
  if (kind === 'item') return { importedText: { content: hashTextBody(content), reveal: hashTextBody(reveal) } };
  return {};
}

type AnchorParent = { body: string; shift: number; search?: SuperMemoParentText };

function anchorParentFor(row: Row, parent: number | null | undefined, written: Map<number, AnchorParent>,
  options: { existingNodeIds?: ReadonlyMap<number, string>; existingParentContent?: (nodeId: string) => string | undefined }): AnchorParent | undefined {
  if (parent == null || row.parentId !== parent) return undefined;
  const prepared = written.get(parent);
  if (prepared) return prepared;
  const existingId = options.existingNodeIds?.get(parent);
  const body = existingId ? options.existingParentContent?.(existingId) : undefined;
  if (body === undefined) return undefined;
  const source = { body, shift: 0 };
  written.set(parent, source);
  return source;
}

function allocateImportedNodeIds(prepared: PreparedRows, existing?: ReadonlyMap<number, string>) {
  const nodeIds = new Map(existing);
  for (const { row } of prepared) {
    if (row.outcome !== 'skipped') nodeIds.set(row.id, `${row.outcome === 'item' ? IMPORTED_REVIEW_NODE_PREFIX : ''}${randomUUID()}`);
  }
  return nodeIds;
}

export function writeSuperMemoRows(prepared: PreparedRows, options: {
  percent: number; offset: string; now: string; gradeMap: SuperMemoGradeMap; sourceFormat: SuperMemoSourceFormat;
  allRows?: Row[]; existingNodeIds?: ReadonlyMap<number, string>;
  existingParentContent?: (nodeId: string) => string | undefined;
}) {
  const { percent, offset, now, gradeMap, sourceFormat, allRows = prepared.map(({ row }) => row) } = options;
  const parents = planSuperMemoImportParents(allRows);
  const nodeIds = allocateImportedNodeIds(prepared, options.existingNodeIds);
  const sourceRows = new Map(allRows.map(row => [row.id, row]));
  const parentBodies = new Map<number, AnchorParent>();
  const priorities = allRows.filter(row => row.sourceRank != null).sort((a, b) => a.sourceRank! - b.sourceRank!);
  const priorityById = new Map(priorities.map((row, index) => [row.id, 1 + Math.floor(index * 9 / priorities.length)]));
  const preparedById = new Map(prepared.map(entry => [entry.row.id, entry]));
  return orderSuperMemoImportWrites(allRows.map(row => ({ row })), parents).flatMap(({ row }) => {
    const entry = preparedById.get(row.id);
    if (!entry) return [];
    const { element, body, answer } = entry;
    const kind = row.outcome;
    const parentNodeId = nodeIds.get(parents.get(row.id) ?? 0) ?? (kind === 'folder' ? null : INBOX_NODE_ID);
    const nodeId = nodeIds.get(row.id) ?? null;
    const due = kind === 'topic' ? row.sourceDue : kind === 'item' && !row.issue && row.sourceState !== 'dismissed'
      ? blendSuperMemoDue(row.sourceDue, row.recalculatedDue, percent) : null;
    let importedAnchorLink: string | null = null;
    let importedCitation: SuperMemoCitation | null = null;
    if (nodeId && kind !== 'skipped') {
      const snapshot: Snapshot = { nodeId, parentNodeId, kind, priority: priorityById.get(row.id) ?? 5,
        title: row.title || `#${row.id}`, isTitleManual: true, content: '', reveal: null, anchorLink: null,
        position: null, createdAt: now, updatedAt: now };
      const article = row.sourceArticleId ? sourceRows.get(row.sourceArticleId) : undefined;
      const articleNodeId = article ? nodeIds.get(article.id) : undefined;
      const parent = parents.get(row.id);
      const placement = sourceFormat.placement;
      const { citation, content } = formatSuperMemoMaterialSource(row, sourceRows.get(parent ?? 0),
        article && articleNodeId ? { id: articleNodeId, title: article.title } : undefined, sourceFormat, body.content);
      if (kind === 'topic') {
        const shift = placement === 'metadata' || placement === 'topic-info' ? content.length - body.content.length : 0;
        parentBodies.set(row.id, { body: body.content, shift });
      }
      const source = sourceRows.get(parent ?? 0)?.outcome === 'topic' ? anchorParentFor(row, parent, parentBodies, options) : undefined;
      if (source && (kind === 'topic' || kind === 'item')) {
        const search = source.search ??= prepareSuperMemoParentText(source.body);
        const locator = kind === 'topic' ? findSuperMemoHighlightLocator(search, element.bodyOrQuestionHtml)
          : findSuperMemoClozeLocator(search, element.bodyOrQuestionHtml, answer.content);
        if (locator) snapshot.anchorLink = { id: `anchor-${randomUUID()}`, kind: kind === 'topic' ? 'highlight' : 'cloze',
          locator: { ...locator, from: locator.from + source.shift, to: locator.to + source.shift } };
      }
      if (snapshot.anchorLink) importedAnchorLink = JSON.stringify(snapshot.anchorLink);
      const reveal = addSuperMemoCitation(answer.content, citation, 'reveal');
      if ((citation?.field === 'content' && content !== body.content) || (citation?.field === 'reveal' && reveal !== answer.content)) {
        importedCitation = citation;
      }
      persistElement(snapshot, element, { ...body, content }, { ...answer, content: reveal }, due, offset, row.sourceState, gradeMap);
    }
    return [{ ...row, sourceExample: undefined, nodeId, importedParentNodeId: parentNodeId, importedAnchorLink, importedCitation,
      ...importedTextReceipt(kind, body.content, answer.content), sourceArticleNodeId: nodeIds.get(row.sourceArticleId ?? 0) ?? null, lastAppliedAt: due ? superMemoDueInstant(due) : null, learning: element.learning, fullOffset: superMemoFullOffset(row.sourceDue, row.recalculatedDue),
      lastApplied: due, unresolvedImages: [...body.unresolvedImages, ...answer.unresolvedImages] }];
  });
}

export async function runSuperMemoImport(input: {
  elements: SuperMemoXmlDraftElement[]; preview: NativeSuperMemoPreview; percent: number;
  offset: string; collectionDirectory?: string | undefined; gradeMap: SuperMemoGradeMap; scheduler: ReviewSchedulerSettings; sourceFormat: SuperMemoSourceFormat; expectedImages: ReadonlyMap<string, string | null>;
}) {
  const { driver } = openDatabaseConnection();
  const { batchId: fingerprint, key } = superMemoBatchKey(input.elements);
  const existing = driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [key]);
  if (existing) {
    const stored = JSON.parse(existing.value) as {
      imported: number; skipped: number; unresolvedImages: number; gradeMap?: SuperMemoGradeMap;
    };
    if (JSON.stringify(stored.gradeMap ?? DEFAULT_SUPER_MEMO_GRADE_MAP) !== JSON.stringify(input.gradeMap)) {
      throw new Error('supermemo_existing_batch_grade_mapping');
    }
    return { batchId: fingerprint, imported: stored.imported, skipped: stored.skipped,
      unresolvedImages: stored.unresolvedImages };
  }
  const prepared = await prepareSuperMemoRows(orderSuperMemoSourceRows(input.preview.rows),
    new Map(input.elements.map(element => [element.id, element])), input.collectionDirectory, input.expectedImages);
  const now = new Date().toISOString();
  return driver.transaction(() => {
    const entries = writeSuperMemoRows(prepared, { ...input, now });
    const imported = entries.filter(entry => entry.nodeId).length;
    const result = { batchId: fingerprint, imported, skipped: entries.length - imported,
      unresolvedImages: entries.reduce((sum, entry) => sum + entry.unresolvedImages.length, 0) };
    const batch = { ...result, formatVersion: 1, ruleVersion: SUPER_MEMO_CONVERSION_RULE_VERSION,
      percent: input.percent, offset: input.offset, gradeMap: input.gradeMap, scheduler: input.scheduler, sourceFormat: input.sourceFormat, entries };
    driver.execute('INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)', [key, JSON.stringify(batch), now]);
    return result;
  });
}
