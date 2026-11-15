import { createHash, randomUUID } from 'node:crypto';

import { IMPORTED_REVIEW_NODE_PREFIX } from '../../lib/core/database/initialReviewSchedule.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { orderSuperMemoImportWrites, orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../lib/core/import/superMemoImportParents.js';
import { superMemoFullOffset } from '../../lib/core/import/superMemoScheduleOffset.js';
import { blendSuperMemoDue, DEFAULT_SUPER_MEMO_GRADE_MAP, SUPER_MEMO_CONVERSION_RULE_VERSION, type SuperMemoGradeMap } from '../../lib/core/import/superMemoSchedulePreview.js';
import { addSuperMemoSource, formatSuperMemoSource, type SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { createInitialNewItemReviewProfile } from '../../lib/core/review/newItemReviewSlots.js';
import type { ReviewSchedulerSettings } from '../../lib/core/review/settings.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { replaceNodeImageResourceReferences } from '../database/nodeResources.js';

import { prepareSuperMemoTopicContent } from './prepareSuperMemoTopicContent.js';
import { importSuperMemoReviewHistory, superMemoDueInstant, superMemoTopicReading } from './superMemoImportSchedule.js';
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

async function prepareRows(rows: Row[], elements: Map<number, SuperMemoXmlDraftElement>, directory?: string,
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

function writeRows(prepared: Awaited<ReturnType<typeof prepareRows>>, percent: number, offset: string, now: string, gradeMap: SuperMemoGradeMap, sourceFormat: SuperMemoSourceFormat) {
  const parents = planSuperMemoImportParents(prepared.map(({ row }) => row));
  const nodeIds = new Map(prepared.flatMap(({ row }) => row.outcome === 'skipped' ? [] :
    [[row.id, `${row.outcome === 'item' ? IMPORTED_REVIEW_NODE_PREFIX : ''}${randomUUID()}`] as const]));
  const sourceRows = new Map(prepared.map(({ row }) => [row.id, row]));
  const priorities = prepared.filter(({ row }) => row.sourceRank != null).sort((a, b) => a.row.sourceRank! - b.row.sourceRank!);
  const priorityById = new Map(priorities.map(({ row }, index) => [row.id, 1 + Math.floor(index * 9 / priorities.length)]));
  return orderSuperMemoImportWrites(prepared, parents).map(({ row, element, body, answer }) => {
    const kind = row.outcome;
    const parentNodeId = nodeIds.get(parents.get(row.id) ?? 0) ?? (kind === 'folder' ? null : INBOX_NODE_ID);
    const nodeId = nodeIds.get(row.id) ?? null;
    const due = kind === 'topic' ? row.sourceDue : kind === 'item' && !row.issue && row.sourceState !== 'dismissed'
      ? blendSuperMemoDue(row.sourceDue, row.recalculatedDue, percent) : null;
    if (nodeId && kind !== 'skipped') {
      const snapshot = { nodeId, parentNodeId, kind, priority: priorityById.get(row.id) ?? 5,
        title: row.title || `#${row.id}`, isTitleManual: true, content: '', reveal: null, anchorLink: null,
        position: null, createdAt: now, updatedAt: now };
      const article = row.sourceArticleId ? sourceRows.get(row.sourceArticleId) : undefined;
      const articleNodeId = article ? nodeIds.get(article.id) : undefined;
      const formatted = formatSuperMemoSource(row.sourceBibliography, row.sourceArticleId,
        article && articleNodeId ? { id: articleNodeId, title: article.title } : undefined, sourceFormat);
      const parent = parents.get(row.id);
      const placement = sourceFormat.placement;
      const inBody = placement === 'content-end' || (kind === 'topic' &&
        (placement !== 'topic-info' || parent == null || sourceRows.get(parent)?.outcome !== 'topic'));
      persistElement(snapshot, element,
        inBody && body.content ? { ...body, content: addSuperMemoSource(body.content, formatted, placement) } : body,
        kind === 'item' && answer.content && (placement === 'metadata' || placement === 'body')
          ? { ...answer, content: addSuperMemoSource(answer.content, formatted, placement) } : answer,
        due, offset, row.sourceState, gradeMap);
    }
    return { ...row, sourceExample: undefined, nodeId, sourceArticleNodeId: nodeIds.get(row.sourceArticleId ?? 0) ?? null, lastAppliedAt: due ? superMemoDueInstant(due) : null, learning: element.learning, fullOffset: superMemoFullOffset(row.sourceDue, row.recalculatedDue),
      lastApplied: due, unresolvedImages: [...body.unresolvedImages, ...answer.unresolvedImages] };
  });
}

export async function runSuperMemoImport(input: {
  elements: SuperMemoXmlDraftElement[]; preview: NativeSuperMemoPreview; percent: number;
  offset: string; collectionDirectory?: string | undefined; gradeMap: SuperMemoGradeMap; scheduler: ReviewSchedulerSettings; sourceFormat: SuperMemoSourceFormat; expectedImages: ReadonlyMap<string, string | null>;
}) {
  const { driver } = openDatabaseConnection();
  const fingerprint = createHash('sha256').update(JSON.stringify(input.elements)).digest('hex');
  const key = `supermemo-import:${fingerprint}`;
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
  const prepared = await prepareRows(orderSuperMemoSourceRows(input.preview.rows),
    new Map(input.elements.map(element => [element.id, element])), input.collectionDirectory, input.expectedImages);
  const now = new Date().toISOString();
  return driver.transaction(() => {
    const entries = writeRows(prepared, input.percent, input.offset, now, input.gradeMap, input.sourceFormat);
    const imported = entries.filter(entry => entry.nodeId).length;
    const result = { batchId: fingerprint, imported, skipped: entries.length - imported,
      unresolvedImages: entries.reduce((sum, entry) => sum + entry.unresolvedImages.length, 0) };
    const batch = { ...result, formatVersion: 1, ruleVersion: SUPER_MEMO_CONVERSION_RULE_VERSION,
      percent: input.percent, offset: input.offset, gradeMap: input.gradeMap, scheduler: input.scheduler, sourceFormat: input.sourceFormat, entries };
    driver.execute('INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)', [key, JSON.stringify(batch), now]);
    return result;
  });
}
