import type { NodeAnchorLink, NodeImageRegionGroup } from '../features/nodes/model/nodeTypes';

import { restoreItemClozeText, textSelectionRanges } from './itemClozeText';

interface SelectionSource {
  id: string;
  kind: string;
  parentNodeId: string | null;
  content: string;
  reveal?: string | null;
  anchorLink?: { locator?: unknown } | null;
}

interface SelectionDraft {
  content: string;
  reveal?: string | null;
  anchorLink?: NodeAnchorLink | null;
  imageRegions?: NodeImageRegionGroup[] | null;
}

function restoreDerivedContent(source: SelectionSource, draft: SelectionDraft): SelectionDraft {
  if (draft.reveal == null && !draft.content.includes('[...]')) return draft;
  const restored = restoreItemClozeText(source);
  if (restored.content === source.content) return draft;
  const ranges = [...textSelectionRanges(draft.anchorLink)].sort((a, b) => a.from - b.from);
  if (!ranges.length) throw new Error('Select text in the Item before creating an annotation.');
  if (ranges.some(range => source.content.slice(range.from, range.to) !== range.originalText)) {
    throw new Error('The Item changed. Select the text again before creating an annotation.');
  }
  const mapped = ranges.map(range => ({
    from: restored.mapPosition(range.from, 'start'), to: restored.mapPosition(range.to, 'end')
  }));
  const selected = mapped.map(range => restored.content.slice(range.from, range.to).trim()).join('\n');
  if (draft.reveal != null) {
    const content = mapped.reduceRight((text, range) => text.slice(0, range.from) + '[...]' + text.slice(range.to), restored.content);
    return { ...draft, content: content.trim(), reveal: selected };
  }
  const previousSelection = ranges.map(range => range.originalText.trim()).join('\n');
  const content = draft.content.startsWith(previousSelection)
    ? selected + draft.content.slice(previousSelection.length) : draft.content;
  return { ...draft, content };
}

export function prepareSelectionDerivedNode(source: SelectionSource, draft: SelectionDraft) {
  if (source.kind !== 'item') return { ...draft, parentNodeId: source.id };
  return { ...restoreDerivedContent(source, draft), parentNodeId: source.parentNodeId, anchorLink: null, imageRegions: null };
}
