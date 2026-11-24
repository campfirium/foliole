import { applySuperMemoStructure } from '../../../../lib/core/import/superMemoImportStructure';
import type { SuperMemoXmlDraftElement } from '../../../../lib/core/import/superMemoXmlDraft';
import { calendarDateKey } from '../../../../lib/core/review/reviewCalendarDates';
import type { NativeSuperMemoPreview, NativeSuperMemoPreviewRow } from '../../../../lib/platform/nativeSuperMemoImportContract';

import { SUPER_MEMO_DEMO_FOLDERS, type SuperMemoDemoTopic } from './superMemoDemoMaterials';

export const SUPER_MEMO_DEMO_COLLECTION_NAME = 'Sample Collection';

const DAY_MS = 86_400_000;

type Node = Pick<SuperMemoXmlDraftElement, 'sourceType' | 'title' | 'bodyOrQuestionHtml' | 'answerHtml'> & { nodes: Node[] };

function node(sourceType: string, title: string, body = '', answer = '', nodes: Node[] = []): Node {
  return { sourceType, title, bodyOrQuestionHtml: body ? [body] : [], answerHtml: answer ? [answer] : [], nodes };
}

function topicNode({ title, body, items }: SuperMemoDemoTopic): Node {
  return node('Topic', title, body ? `<p>${body}</p>` : '', '', items.map(([question, answer]) =>
    node('Item', question, `<p>${question}</p>`, `<p>${answer}</p>`)));
}

function collectionTree(): Node {
  const folders = SUPER_MEMO_DEMO_FOLDERS.map(({ title, topics }) =>
    node('Concept', title, '', '', topics.map(topicNode)));
  return { ...node('Topic', '', '', '', folders), title: null };
}

function shiftDay(today: string, days: number) {
  return new Date(Date.parse(today) + days * DAY_MS).toISOString().slice(0, 10);
}

function sourceDate(day: string) {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}

// Spreads sample items from slightly overdue to about half a year ahead of today.
function schedule(today: string, index: number) {
  const dueOffset = (index * 37) % 190 - 14;
  const interval = 20 + (index * 13) % 70;
  const adjustment = (index % 5 - 2) * 9 - 6;
  const last = dueOffset - interval;
  return {
    intervalDays: interval,
    historyCount: 2 + index % 6,
    lastRepetition: sourceDate(shiftDay(today, Math.min(last, -1))),
    sourceDue: shiftDay(today, dueOffset),
    recalculatedDue: shiftDay(today, Math.max(dueOffset + adjustment, Math.min(last, -1)))
  };
}

const unscheduled = { intervalDays: null, historyCount: 0, lastRepetition: null, sourceDue: null, recalculatedDue: null };

export function createSuperMemoDemoCollection(now = new Date()) {
  const today = calendarDateKey(now);
  const elements: SuperMemoXmlDraftElement[] = [];
  const rows: NativeSuperMemoPreviewRow[] = [];
  let nextId = 1;
  let itemIndex = 0;
  function add({ nodes, ...source }: Node, parentId: number | null, ordinal: number): number {
    const id = nextId++;
    const element: SuperMemoXmlDraftElement = {
      ...source, id, parentId, ordinal: String(ordinal), children: [], skippedAudioComponents: 0, learning: null
    };
    const item = source.sourceType === 'Item';
    elements.push(element);
    rows.push({
      id, parentId, sourceType: source.sourceType, title: source.title ?? '',
      outcome: item ? 'item' : 'topic', issue: null,
      ...(item ? schedule(today, itemIndex++) : unscheduled),
      replayedCount: 0, historyNeedsReview: false
    });
    element.children = nodes.map((child, index) => add(child, id, index + 1));
    return id;
  }
  add(collectionTree(), null, 0);
  const preview: NativeSuperMemoPreview = {
    rows: applySuperMemoStructure(rows, elements, []), referenceDay: today, pairedCollection: true
  };
  return { elements, preview };
}
