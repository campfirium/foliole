import type { RefObject } from 'react';

import {
  InspectorList,
  InspectorListRow,
  inspectorListBodyClassName,
  inspectorListDividerBorderClassName,
  VirtualListSurface,
  type VirtualListRenderMeta
} from '../../shared/ui';

const HIGHLIGHT_ROW_ESTIMATE_PX = 88;

export interface SidebarHighlightItem {
  kind: 'cloze' | 'highlight';
  nodeId: string;
  text: string;
}

interface WorkspaceRightSidebarHighlightsListProps {
  ariaLabel: string;
  highlights: readonly SidebarHighlightItem[];
  onRevealHighlight: (nodeId: string) => void;
  scrollElementRef: RefObject<HTMLElement>;
}

function renderHighlightRow(
  highlight: SidebarHighlightItem,
  meta: VirtualListRenderMeta,
  itemCount: number,
  onRevealHighlight: (nodeId: string) => void
) {
  const dividerClassName = meta.index === itemCount - 1
    ? ''
    : inspectorListDividerBorderClassName;
  return (
    <div
      aria-posinset={meta.ariaPosInSet}
      aria-setsize={meta.ariaSetSize}
      className={`min-w-0 ${dividerClassName}`}
      role="listitem"
    >
      <InspectorListRow
        className="flex-col items-start px-0 py-4"
        onClick={() => onRevealHighlight(highlight.nodeId)}
        type="button"
      >
        <span className={`${inspectorListBodyClassName} max-w-full whitespace-normal break-words leading-7 text-foreground`}>
          {highlight.text}
        </span>
      </InspectorListRow>
    </div>
  );
}

export function WorkspaceRightSidebarHighlightsList({
  ariaLabel,
  highlights,
  onRevealHighlight,
  scrollElementRef
}: WorkspaceRightSidebarHighlightsListProps) {
  return (
    <InspectorList ariaLabel={ariaLabel} as="div">
      <VirtualListSurface
        estimateSize={() => HIGHLIGHT_ROW_ESTIMATE_PX}
        getItemKey={(highlight) => highlight.nodeId}
        items={highlights}
        measureItems
        renderItem={(highlight, meta) =>
          renderHighlightRow(highlight, meta, highlights.length, onRevealHighlight)}
        scrollElementRef={scrollElementRef}
      />
    </InspectorList>
  );
}
