import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';

export type CommandMarkupType = 'cloze' | 'highlight';

export interface SelectionCommandEntry {
  anchorId: string;
  clozeContent: string;
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
const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;

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
  const selections = getNormalizedSelectionRanges(adapter, content.length);
  if (selections.length === 0) {
    return null;
  }
  let nextAnchorId = getNextAnchorNumericId(content);
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
        anchorId: String(nextAnchorId),
        clozeContent,
        range,
        selectionText
      };
      nextAnchorId += 1;
      return entry;
    })
    .filter((entry): entry is SelectionCommandEntry => entry !== null);
  if (entries.length === 0) {
    return null;
  }
  const clozeContent = buildCombinedClozeContent(content, entries);
  const selectionText = entries.map((entry) => entry.selectionText).join('\n');

  return {
    anchorId: entries[0]?.anchorId ?? String(nextAnchorId),
    clozeContent,
    entries,
    parentNodeId,
    selectionText
  };
}

function stripAnchorTags(value: string) {
  return value.replace(ANCHOR_TAG_PATTERN, '');
}

export function applySelectionMarkup(
  adapter: EditorAdapter | null,
  markupType: CommandMarkupType,
  entries: SelectionCommandEntry[]
) {
  if (!adapter || entries.length === 0) {
    return false;
  }
  const content = adapter.getContent();
  const tagName = markupType === 'highlight' ? 'highlight' : 'cloze';
  let applied = false;
  [...entries]
    .sort((left, right) => right.range.from - left.range.from)
    .forEach((entry) => {
      const selectedText = content.slice(entry.range.from, entry.range.to);
      if (!selectedText.trim()) {
        return;
      }
      adapter.replaceRange(
        entry.range.from,
        entry.range.to,
        `<${tagName} id="${entry.anchorId}">${selectedText}</${tagName} id="${entry.anchorId}">`
      );
      applied = true;
    });
  return applied;
}

function getNormalizedSelectionRanges(adapter: EditorAdapter, max: number) {
  const selections = adapter
    .getSelectionRanges()
    .map((selection) => ({
      from: Math.max(0, Math.min(selection.from, selection.to, max)),
      to: Math.max(0, Math.min(Math.max(selection.from, selection.to), max))
    }))
    .filter((selection) => selection.from < selection.to)
    .sort((left, right) => left.from - right.from);
  return selections.filter((selection, index) => {
    const previous = selections[index - 1];
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

function getNextAnchorNumericId(content: string): number {
  let maxId = 0;
  for (const match of content.matchAll(/<(?:highlight|cloze)\s+id="([1-9]\d*)"\s*>/g)) {
    const id = Number.parseInt(match[1] ?? '', 10);
    if (Number.isFinite(id) && id > maxId) {
      maxId = id;
    }
  }
  return maxId + 1;
}
