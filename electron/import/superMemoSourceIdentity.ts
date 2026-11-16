import { createHash } from 'node:crypto';

import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import type { NativeSuperMemoSourceMatch } from '../../lib/platform/nativeSuperMemoImportContract.js';

import { superMemoBatchKey } from './superMemoBatchKey.js';

export interface SuperMemoSourceEvidence {
  type: string;
  content: string | null;
  title?: string | null;
  parentId?: number | null;
  reviews: string[];
}

export function superMemoSourceEvidence(element: SuperMemoXmlDraftElement): SuperMemoSourceEvidence {
  const parts = [element.bodyOrQuestionHtml, element.answerHtml];
  const content = parts.some(group => group.some(part => part.trim()))
    ? createHash('sha256').update(JSON.stringify([element.sourceType, parts])).digest('hex') : null;
  return { type: element.sourceType, content, title: element.title, parentId: element.parentId, reviews: (element.learning?.history ?? [])
    .map(event => JSON.stringify([event.date, event.hour, event.grade, event.repetition, event.lapses])) };
}

type Entry = { id: number; sourceEvidence?: SuperMemoSourceEvidence };
export function superMemoExportLinkKey(hash: string) {
  return `supermemo-export-link:${hash}`;
}

function continuousHistory(before: SuperMemoSourceEvidence, after: SuperMemoSourceEvidence) {
  return before.reviews.length >= 2 && new Set(before.reviews.map(event => event.split(',').slice(0, 2).join(','))).size >= 2 &&
    before.reviews.every((event, index) => after.reviews[index] === event);
}

function contentOccurrences(evidence: Iterable<SuperMemoSourceEvidence>) {
  const counts = new Map<string, number>();
  for (const { content } of evidence) if (content) counts.set(content, (counts.get(content) ?? 0) + 1);
  return counts;
}

function verifyEmptyContainers(elements: SuperMemoXmlDraftElement[], before: ReadonlyMap<number, SuperMemoSourceEvidence>,
  after: ReadonlyMap<number, SuperMemoSourceEvidence>, known: ReadonlySet<number>, verified: Set<number>) {
  for (const element of [...elements].reverse()) {
    if (!known.has(element.id) || verified.has(element.id) || !['Topic', 'Concept'].includes(element.sourceType)) continue;
    const old = before.get(element.id);
    const fresh = after.get(element.id)!;
    if (!old || old.type !== fresh.type || old.content !== null || fresh.content !== null ||
        !old.title?.trim() || old.title !== fresh.title || old.parentId !== fresh.parentId) continue;
    if (element.children.some(id => verified.has(id) && before.get(id)?.parentId === element.id)) verified.add(element.id);
  }
}

export function matchReexportedSuperMemo(input: {
  batchId: string; activeExport?: string; exportHash: string; entries: readonly Entry[];
  elements: SuperMemoXmlDraftElement[]; reference?: SuperMemoXmlDraftElement[]; alreadyLinked: boolean;
}) {
  const { batchId, activeExport, exportHash, entries, elements, reference, alreadyLinked } = input;
  const validReference = reference && superMemoBatchKey(reference).batchId === batchId ? reference : undefined;
  const before = new Map((validReference ?? []).map(element => [element.id, superMemoSourceEvidence(element)]));
  for (const entry of entries) if (entry.sourceEvidence) before.set(entry.id, entry.sourceEvidence);
  const after = new Map(elements.map(element => [element.id, superMemoSourceEvidence(element)]));
  const oldCounts = contentOccurrences(before.values());
  const newCounts = contentOccurrences(after.values());
  const known = new Set(entries.map(entry => entry.id));
  const verified = new Set<number>();
  const added = new Set<number>();
  const conflicts: NativeSuperMemoSourceMatch['conflicts'] = [];
  let strong = 0;
  for (const element of elements) {
    const next = after.get(element.id)!;
    const previous = before.get(element.id);
    if (!known.has(element.id)) {
      if (next.content && oldCounts.has(next.content)) conflicts.push({ sourceId: element.id, title: element.title ?? '', reason: 'renumbered' });
      else added.add(element.id);
      continue;
    }
    const uniqueContent = next.content !== null && previous?.content === next.content &&
      oldCounts.get(next.content) === 1 && newCounts.get(next.content) === 1;
    if (previous?.type === next.type && (uniqueContent || continuousHistory(previous, next))) {
      verified.add(element.id);
      strong++;
    }
  }
  verifyEmptyContainers(elements, before, after, known, verified);
  for (const element of elements) {
    if (known.has(element.id) && !verified.has(element.id)) {
      conflicts.push({ sourceId: element.id, title: element.title ?? '', reason: 'number-conflict' });
    }
  }
  const countWithEvidence = [...before.values()].filter(value => value.content || value.reviews.length >= 2).length;
  const proven = strong >= Math.min(2, Math.max(1, countWithEvidence)) && verified.size > conflicts.filter(item => item.reason === 'number-conflict').length;
  const status = alreadyLinked && activeExport && exportHash !== activeExport ? 'older-export'
    : !alreadyLinked && (!before.size || !proven) ? 'unverified' : 'verified';
  const orderedConflicts = new Map(conflicts.map(conflict => [conflict.sourceId, conflict]));
  const match: NativeSuperMemoSourceMatch = { status, matched: verified.size, additions: added.size,
    conflicts: elements.flatMap(element => orderedConflicts.get(element.id) ?? []) };
  return { match, before, after, verified, added };
}
