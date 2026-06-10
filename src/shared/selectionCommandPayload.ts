import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences';
import { parseAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl';
import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';
import { collectMarkdownInlineRanges } from '../features/editor/model/markdownInlineProjection';
import type { MarkdownInlineRange } from '../features/editor/model/markdownInlineProjectionTypes';
import type { NodeImageRegionGroup, TextAnchorLocator } from '../features/nodes/model/nodeTypes';

interface SelectionCommandEntry {
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
      const normalizedRange = normalizeMarkdownInlineSelectionRange(content, range);
      const locator = buildTextLocator(content, normalizedRange);
      if (!locator) {
        return null;
      }
      const prefix = content.slice(0, normalizedRange.from);
      const suffix = content.slice(normalizedRange.to);
      const clozeRawContent = `${prefix}${CLOZE_PLACEHOLDER}${suffix}`;
      return {
        anchorId: createAnchorId(),
        clozeContent: clozeRawContent || CLOZE_PLACEHOLDER,
        locator,
        range: normalizedRange,
        selectionText: locator.originalText
      };
    })
    .filter((entry): entry is SelectionCommandEntry => entry !== null);
  if (entries.length === 0) {
    return null;
  }
  return {
    anchorId: entries[0]?.anchorId ?? createAnchorId(),
    clozeContent: buildCombinedClozeContent(content, entries),
    entries,
    imageRegions: buildSelectedImageRegions(content, entries),
    parentNodeId,
    selectionText: entries.map((entry) => entry.selectionText).join('\n')
  };
}

function buildTextLocator(content: string, range: EditorSelection): TextAnchorLocator | null {
  const rawSelectionText = content.slice(range.from, range.to);
  const leadingWhitespaceLength = rawSelectionText.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespaceLength = rawSelectionText.match(/\s*$/)?.[0].length ?? 0;
  const from = range.from + leadingWhitespaceLength;
  const to = Math.max(from, range.to - trailingWhitespaceLength);
  const originalText = content.slice(from, to);
  return originalText ? { from, originalText, to } : null;
}

function normalizeMarkdownInlineSelectionRange(content: string, range: EditorSelection): EditorSelection {
  const inlineRange = collectMarkdownInlineRanges(content).find((candidate) => canTrimInlineSelection(candidate, range));
  if (!inlineRange) return range;

  return {
    from: Math.max(range.from, inlineRange.contentFrom),
    to: Math.min(range.to, inlineRange.contentTo)
  };
}

function canTrimInlineSelection(candidate: MarkdownInlineRange, range: EditorSelection) {
  if (range.from < candidate.from || range.to > candidate.to) return false;
  const semanticFrom = Math.max(range.from, candidate.contentFrom);
  const semanticTo = Math.min(range.to, candidate.contentTo);
  if (semanticFrom >= semanticTo) return false;

  return (
    isRangeCoveredBySyntax(candidate.syntaxRanges, range.from, semanticFrom) &&
    isRangeCoveredBySyntax(candidate.syntaxRanges, semanticTo, range.to)
  );
}

function isRangeCoveredBySyntax(syntaxRanges: MarkdownInlineRange['syntaxRanges'], from: number, to: number) {
  if (from >= to) return true;
  let cursor = from;
  for (const syntaxRange of syntaxRanges) {
    if (syntaxRange.to <= cursor) continue;
    if (syntaxRange.from > cursor) return false;
    cursor = Math.max(cursor, syntaxRange.to);
    if (cursor >= to) return true;
  }
  return false;
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
    if (!previous || selection.from > previous.to) {
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
      height: 1,
      id: `${entries[0]?.anchorId ?? 'anchor'}-image-${index}`,
      width: 1,
      x: 0,
      y: 0
    });
  });

  return groupsByAttachmentId.size > 0 ? [...groupsByAttachmentId.values()] : null;
}
