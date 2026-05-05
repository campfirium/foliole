import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';
import { stripAnchorBlocks } from '../features/editor/model/anchorBlocks';
import type { TextAnchorLocator } from '../features/nodes/model/nodeTypes';

export interface SelectionCommandEntry {
  anchorId: string;
  clozeContent: string;
  locator: TextAnchorLocator;
  range: EditorSelection;
  selectionText: string;
}

export interface SelectionCommandPayload {
  anchorId: string;
  clozeContent: string;
  entries: SelectionCommandEntry[];
  parentNodeId: string;
  selectionText: string;
}

const CLOZE_PLACEHOLDER = '[...]';

function createAnchorId() {
  return `anchor-${crypto.randomUUID()}`;
}

export function normalizeContextMenuPosition(left: number, top: number) {
  const menuWidth = 200;
  const menuHeight = 110;
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - menuWidth)),
    top: Math.max(8, Math.min(top, window.innerHeight - menuHeight))
  };
}

export function getSelectionCommandPayload(
  parentNodeId: string,
  adapter: EditorAdapter | null
): SelectionCommandPayload | null {
  if (!adapter) {
    return null;
  }

  const content = adapter.getContent();
  return buildSelectionCommandPayload(parentNodeId, content, getNormalizedSelectionRanges(adapter, content.length));
}

export function getSelectionCommandPayloadForRanges(
  parentNodeId: string,
  adapter: EditorAdapter | null,
  ranges: EditorSelection[]
): SelectionCommandPayload | null {
  if (!adapter) {
    return null;
  }
  return buildSelectionCommandPayload(parentNodeId, adapter.getContent(), normalizeSelectionRanges(ranges, adapter.getContent().length));
}

export function getSelectionCommandPayloadForContentRanges(
  parentNodeId: string,
  content: string,
  ranges: EditorSelection[]
): SelectionCommandPayload | null {
  return buildSelectionCommandPayload(parentNodeId, content, normalizeSelectionRanges(ranges, content.length));
}

function buildSelectionCommandPayload(
  parentNodeId: string,
  content: string,
  selections: EditorSelection[]
): SelectionCommandPayload | null {
  if (selections.length === 0) {
    return null;
  }
  const entries = selections
    .map((range): SelectionCommandEntry | null => {
      const selectionText = stripAnchorTags(content.slice(range.from, range.to)).trim();
      if (!selectionText) {
        return null;
      }
      const prefix = content.slice(0, range.from);
      const suffix = content.slice(range.to);
      const clozeRawContent = `${prefix}${CLOZE_PLACEHOLDER}${suffix}`;
      const clozeContent = stripAnchorTags(clozeRawContent) || CLOZE_PLACEHOLDER;
      const entry = {
        anchorId: createAnchorId(),
        clozeContent,
        locator: {
          from: range.from,
          originalText: selectionText,
          to: range.to
        },
        range,
        selectionText
      };
      return entry;
    })
    .filter((entry): entry is SelectionCommandEntry => entry !== null);
  if (entries.length === 0) {
    return null;
  }
  const clozeContent = buildCombinedClozeContent(content, entries);
  const selectionText = entries.map((entry) => entry.selectionText).join('\n');

  return {
    anchorId: entries[0]?.anchorId ?? createAnchorId(),
    clozeContent,
    entries,
    parentNodeId,
    selectionText
  };
}

function stripAnchorTags(value: string) { return stripAnchorBlocks(value); }

function getNormalizedSelectionRanges(adapter: EditorAdapter, max: number) {
  return normalizeSelectionRanges(adapter.getSelectionRanges(), max);
}

function normalizeSelectionRanges(selections: EditorSelection[], max: number) {
  const normalizedSelections = selections
    .map((selection) => ({
      from: Math.max(0, Math.min(selection.from, selection.to, max)),
      to: Math.max(0, Math.min(Math.max(selection.from, selection.to), max))
    }))
    .filter((selection) => selection.from < selection.to)
    .sort((left, right) => left.from - right.from);
  return normalizedSelections.filter((selection, index) => {
    const previous = normalizedSelections[index - 1];
    return !previous || previous.from !== selection.from || previous.to !== selection.to;
  });
}

function buildCombinedClozeContent(content: string, entries: SelectionCommandEntry[]) {
  const clozeRawContent = [...entries]
    .sort((left, right) => right.range.from - left.range.from)
    .reduce(
      (currentContent, entry) =>
        `${currentContent.slice(0, entry.range.from)}${CLOZE_PLACEHOLDER}${currentContent.slice(entry.range.to)}`,
      content
    );
  return stripAnchorTags(clozeRawContent) || CLOZE_PLACEHOLDER;
}
