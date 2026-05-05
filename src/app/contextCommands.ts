import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences';
import { parseAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl';
import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';
import type { NodeImageRegionGroup } from '../features/nodes/model/nodeTypes';
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
  imageRegions?: NodeImageRegionGroup[] | null;
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
      const locator = buildTextLocator(content, range);
      if (!locator) {
        return null;
      }
      const prefix = content.slice(0, range.from);
      const suffix = content.slice(range.to);
      const clozeRawContent = `${prefix}${CLOZE_PLACEHOLDER}${suffix}`;
      const clozeContent = clozeRawContent || CLOZE_PLACEHOLDER;
      const entry = {
        anchorId: createAnchorId(),
        clozeContent,
        locator,
        range,
        selectionText: locator.originalText
      };
      return entry;
    })
    .filter((entry): entry is SelectionCommandEntry => entry !== null);
  if (entries.length === 0) {
    return null;
  }
  const clozeContent = buildCombinedClozeContent(content, entries);
  const imageRegions = buildSelectedImageRegions(content, entries);
  const selectionText = entries.map((entry) => entry.selectionText).join('\n');

  return {
    anchorId: entries[0]?.anchorId ?? createAnchorId(),
    clozeContent,
    entries,
    imageRegions,
    parentNodeId,
    selectionText
  };
}

function buildTextLocator(content: string, range: EditorSelection): TextAnchorLocator | null {
  const rawSelectionText = content.slice(range.from, range.to);
  const leadingWhitespaceLength = rawSelectionText.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespaceLength = rawSelectionText.match(/\s*$/)?.[0].length ?? 0;
  const from = range.from + leadingWhitespaceLength;
  const to = Math.max(from, range.to - trailingWhitespaceLength);
  const originalText = content.slice(from, to);
  if (!originalText) {
    return null;
  }
  return {
    from,
    originalText,
    to
  };
}

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
  return normalizedSelections.reduce<Array<{ from: number; to: number }>>((merged, selection) => {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(selection);
      return merged;
    }
    if (selection.from > previous.to) {
      merged.push(selection);
      return merged;
    }
    previous.to = Math.max(previous.to, selection.to);
    return merged;
  }, []);
}

function buildCombinedClozeContent(content: string, entries: SelectionCommandEntry[]) {
  const clozeRawContent = [...entries]
    .sort((left, right) => right.range.from - left.range.from)
    .reduce(
      (currentContent, entry) =>
        `${currentContent.slice(0, entry.range.from)}${CLOZE_PLACEHOLDER}${currentContent.slice(entry.range.to)}`,
      content
    );
  return clozeRawContent || CLOZE_PLACEHOLDER;
}

function buildSelectedImageRegions(content: string, entries: SelectionCommandEntry[]): NodeImageRegionGroup[] | null {
  const groupsByAttachmentId = new Map<string, NodeImageRegionGroup>();
  const selectedRanges = entries.map((entry) => entry.range);

  collectMarkdownImageReferences(content).forEach((match, index) => {
    if (!selectedRanges.some((range) => range.from < match.end && range.to > match.start)) {
      return;
    }
    const target = parseMarkdownImageTarget(match.rawTarget);
    const attachmentId = target ? parseAssetMarkdownUrl(target.destination) : null;
    if (!attachmentId) {
      return;
    }
    const group = groupsByAttachmentId.get(attachmentId) ?? { attachmentId, regions: [] };
    if (!groupsByAttachmentId.has(attachmentId)) {
      groupsByAttachmentId.set(attachmentId, group);
    }
    group.regions.push({
      id: `${entries[0]?.anchorId ?? 'anchor'}-image-${index}`,
      height: 1,
      width: 1,
      x: 0,
      y: 0
    });
  });

  return groupsByAttachmentId.size > 0 ? [...groupsByAttachmentId.values()] : null;
}
