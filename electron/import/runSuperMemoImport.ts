import { createHash, randomUUID } from 'node:crypto';

import { IMPORTED_REVIEW_NODE_PREFIX } from '../../lib/core/database/initialReviewSchedule.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { superMemoFullOffset } from '../../lib/core/import/superMemoScheduleOffset.js';
import { blendSuperMemoDue, SUPER_MEMO_CONVERSION_RULE_VERSION } from '../../lib/core/import/superMemoSchedulePreview.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { createInitialNewItemReviewProfile } from '../../lib/core/review/newItemReviewSlots.js';
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

function orderedRows(rows: Row[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const children = new Map<number | null, number[]>();
  for (const row of rows) {
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row.id);
    children.set(row.parentId, siblings);
  }
  const ordered: Row[] = [];
  const pending = [...children.get(null) ?? []].reverse();
  while (pending.length) {
    const row = byId.get(pending.pop()!)!;
    ordered.push(row);
    pending.push(...[...row.sourceChildren ?? children.get(row.id) ?? []].reverse());
  }
  return ordered;
}

function persistElement(snapshot: Snapshot, element: SuperMemoXmlDraftElement, body: Prepared, answer: Prepared,
  due: string | null, offset: string) {
  if (snapshot.kind === 'topic') {
    persistSuperMemoTopic({ ...snapshot, reading: superMemoTopicReading(element, due, snapshot.priority ?? 5, snapshot.createdAt) }, body);
  } else if (snapshot.kind === 'item') {
    upsertNodeSnapshot({ ...snapshot, content: body.content, reveal: answer.content,
      ...(due ? { review: createInitialNewItemReviewProfile(superMemoDueInstant(due)) } : {}) });
    const images = [...body.resourceReferences, ...answer.resourceReferences];
    if (images.length) replaceNodeImageResourceReferences(snapshot.nodeId, images);
    if (body.content && answer.content) importSuperMemoReviewHistory(element, snapshot.nodeId, offset);
  } else {
    upsertNodeSnapshot(snapshot);
  }
}

async function prepareRows(rows: Row[], elements: Map<number, SuperMemoXmlDraftElement>, directory?: string) {
  const empty: Prepared = { content: '', resourceReferences: [], unresolvedImages: [] };
  const prepared = [];
  for (const row of rows) {
    const element = elements.get(row.id)!;
    const body = row.outcome === 'topic' || row.outcome === 'item'
      ? await prepareSuperMemoTopicContent(element.bodyOrQuestionHtml, directory) : empty;
    const answer = row.outcome === 'item' ? await prepareSuperMemoTopicContent(element.answerHtml, directory) : empty;
    prepared.push({ row, element, body, answer });
  }
  return prepared;
}

function writeRows(prepared: Awaited<ReturnType<typeof prepareRows>>, percent: number, offset: string, now: string) {
  const destinations = new Map<number, { contentParent: string | null; folderParent: string | null }>();
  const priorities = prepared.filter(({ row }) => row.sourceRank != null).sort((a, b) => a.row.sourceRank! - b.row.sourceRank!);
  const priorityById = new Map(priorities.map(({ row }, index) => [row.id, 1 + Math.floor(index * 9 / priorities.length)]));
  return prepared.map(({ row, element, body, answer }) => {
    const parent = row.parentId === null ? undefined : destinations.get(row.parentId);
    const kind = row.outcome;
    const parentNodeId = kind === 'folder' ? parent?.folderParent ?? null : parent?.contentParent ?? INBOX_NODE_ID;
    const nodeId = kind === 'skipped' ? null : `${kind === 'item' ? IMPORTED_REVIEW_NODE_PREFIX : ''}${randomUUID()}`;
    destinations.set(row.id, {
      contentParent: kind === 'folder' || kind === 'topic' ? nodeId : parent?.contentParent ?? null,
      folderParent: kind === 'folder' ? nodeId : parent?.folderParent ?? null
    });
    const due = kind === 'topic' ? row.sourceDue : kind === 'item' && !row.issue
      ? blendSuperMemoDue(row.sourceDue, row.recalculatedDue, percent) : null;
    if (nodeId && kind !== 'skipped') {
      const snapshot = { nodeId, parentNodeId, kind, priority: priorityById.get(row.id) ?? 5,
        title: row.title || `#${row.id}`, isTitleManual: true, content: '', reveal: null, anchorLink: null,
        position: null, createdAt: now, updatedAt: now };
      persistElement(snapshot, element, body, answer, due, offset);
    }
    return { ...row, nodeId, lastAppliedAt: due ? superMemoDueInstant(due) : null, learning: element.learning, fullOffset: superMemoFullOffset(row.sourceDue, row.recalculatedDue),
      lastApplied: due, unresolvedImages: [...body.unresolvedImages, ...answer.unresolvedImages] };
  });
}

export async function runSuperMemoImport(input: {
  elements: SuperMemoXmlDraftElement[]; preview: NativeSuperMemoPreview; percent: number;
  offset: string; collectionDirectory?: string | undefined;
}) {
  const { driver } = openDatabaseConnection();
  const fingerprint = createHash('sha256').update(JSON.stringify(input.elements)).digest('hex');
  const key = `supermemo-import:${fingerprint}`;
  const existing = driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [key]);
  if (existing) {
    const stored = JSON.parse(existing.value) as { imported: number; skipped: number; unresolvedImages: number };
    return { batchId: fingerprint, imported: stored.imported, skipped: stored.skipped,
      unresolvedImages: stored.unresolvedImages };
  }
  const prepared = await prepareRows(orderedRows(input.preview.rows),
    new Map(input.elements.map(element => [element.id, element])), input.collectionDirectory);
  const now = new Date().toISOString();
  return driver.transaction(() => {
    const entries = writeRows(prepared, input.percent, input.offset, now);
    const imported = entries.filter(entry => entry.nodeId).length;
    const result = { batchId: fingerprint, imported, skipped: entries.length - imported,
      unresolvedImages: entries.reduce((sum, entry) => sum + entry.unresolvedImages.length, 0) };
    const batch = { ...result, formatVersion: 1, ruleVersion: SUPER_MEMO_CONVERSION_RULE_VERSION,
      percent: input.percent, offset: input.offset, entries };
    driver.execute('INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)', [key, JSON.stringify(batch), now]);
    return result;
  });
}
