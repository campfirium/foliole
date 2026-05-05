import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../../shared/lib/utils';

import {
  getOutlineLayerWidth,
  mayHaveOutline,
  type OutlineDisplayItem,
  type OutlineHorizontalMetrics,
  resolveActiveIndex,
  resolveDisplayItems,
  resolveOutlineHorizontalMetrics
} from './DocumentOutlineLayerModel';
import { useOutlinePanelPositioning } from './documentOutlineLayerPositioning';

interface DocumentOutlineLayerProps {
  content: string;
  documentMaxWidth: number;
  onRevealPosition: (position: number) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
}

const HOVER_ZONE_WIDTH_PX = 72;
const OUTLINE_DEFAULT_ANCHOR_Y = 240;
const OUTLINE_OPEN_DELAY_MS = 120;
const OUTLINE_VISIBLE_OPACITY = 0.8;
const OUTLINE_EDGE_CLEARANCE_PX = 12;

function OutlineItem({
  isActive,
  level,
  itemRef,
  text,
  onSelect
}: {
  isActive: boolean;
  level: number;
  itemRef?: (node: HTMLButtonElement | null) => void;
  text: string;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        'flex w-full items-start py-1 text-left text-sm transition-all hover:translate-x-[-2px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isActive ? 'text-foreground/85 hover:text-foreground' : 'text-foreground/42 hover:text-foreground/90',
        level === 1 ? 'font-bold' : 'font-normal'
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      ref={itemRef}
      style={{ paddingLeft: `${(level - 1) * 0.75}rem` }}
      type="button"
    >
      <span className="line-clamp-2">{text}</span>
    </button>
  );
}

function OutlineList({
  activeIndex,
  horizontalMetrics,
  isOpen,
  items,
  onRevealPosition,
  panelPaddingTop,
  panelPaddingBottom,
  panelRef,
  setActiveItemRef
}: {
  activeIndex: number;
  horizontalMetrics: OutlineHorizontalMetrics;
  isOpen: boolean;
  items: OutlineDisplayItem[];
  onRevealPosition: (position: number) => void;
  panelPaddingTop: number;
  panelPaddingBottom: number;
  panelRef: (node: HTMLDivElement | null) => void;
  setActiveItemRef: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        'scrollbar-hidden pointer-events-auto absolute overflow-y-auto transition-all duration-150',
        isOpen ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
      )}
      ref={panelRef}
      style={{
        bottom: '0',
        opacity: isOpen ? OUTLINE_VISIBLE_OPACITY : 0,
        right: `${horizontalMetrics.panelRight}px`,
        top: '0',
        width: `${horizontalMetrics.panelWidth}px`
      }}
    >
      <nav
        aria-label="Document outline entries"
        className="min-h-full"
        style={{ paddingBottom: `${panelPaddingBottom}px`, paddingTop: `${panelPaddingTop}px` }}
      >
        <ol className="m-0 list-none space-y-1 p-0">
          {items.map((item, index) => (
            <li key={`${item.from}-${item.text}`}>
              <OutlineItem
                isActive={index === activeIndex}
                itemRef={index === activeIndex ? setActiveItemRef : undefined}
                level={item.level}
                onSelect={() => onRevealPosition(item.from)}
                text={item.text}
              />
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

function useOutlineHoverState(
  documentMaxWidth: number,
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null,
  resolveOutlineItems: () => OutlineDisplayItem[]
) {
  const [anchorY, setAnchorY] = useState(OUTLINE_DEFAULT_ANCHOR_Y);
  const [anchorPosition, setAnchorPosition] = useState(0);
  const [horizontalMetrics, setHorizontalMetrics] = useState<OutlineHorizontalMetrics>({
    panelRight: 0,
    panelWidth: HOVER_ZONE_WIDTH_PX
  });
  const [isOpen, setIsOpen] = useState(false);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const openDelayTimerRef = useRef<number | null>(null);

  const clearOpenDelay = () => {
    if (openDelayTimerRef.current === null) {
      return;
    }
    window.clearTimeout(openDelayTimerRef.current);
    openDelayTimerRef.current = null;
  };

  const openOutline = (clientY: number) => {
    clearOpenDelay();
    openDelayTimerRef.current = window.setTimeout(() => {
      openDelayTimerRef.current = null;
      if (!layerRef.current) {
        return;
      }
      if (resolveOutlineItems().length === 0) {
        return;
      }
      const rect = layerRef.current.getBoundingClientRect();
      const containerWidth = layerRef.current.parentElement?.getBoundingClientRect().width ?? rect.width;
      const nextAnchorPosition = onResolveDocumentPositionAtViewportY(clientY);
      setHorizontalMetrics(resolveOutlineHorizontalMetrics(containerWidth, documentMaxWidth));
      setAnchorY(Math.max(0, clientY - rect.top));
      if (nextAnchorPosition !== null) {
        setAnchorPosition(nextAnchorPosition);
      }
      setIsOpen(true);
    }, OUTLINE_OPEN_DELAY_MS);
  };

  const closeOutline = () => {
    clearOpenDelay();
    setIsOpen(false);
  };

  useEffect(() => clearOpenDelay, []);

  return {
    anchorPosition,
    anchorY,
    closeOutline,
    horizontalMetrics,
    isOpen,
    layerRef,
    openOutline
  };
}

export function DocumentOutlineLayer({
  content,
  documentMaxWidth,
  onRevealPosition,
  onResolveDocumentPositionAtViewportY
}: DocumentOutlineLayerProps) {
  const [outlineItems, setOutlineItems] = useState<OutlineDisplayItem[] | null>(null);
  const hasOutlineCandidate = useMemo(() => mayHaveOutline(content), [content]);
  const resolveOutlineItems = useCallback(() => {
    if (outlineItems !== null) {
      return outlineItems;
    }
    const nextItems = resolveDisplayItems(content);
    setOutlineItems(nextItems);
    return nextItems;
  }, [content, outlineItems]);
  useEffect(() => {
    setOutlineItems(null);
  }, [content]);
  const { anchorPosition, anchorY, closeOutline, horizontalMetrics, isOpen, layerRef, openOutline } =
    useOutlineHoverState(documentMaxWidth, onResolveDocumentPositionAtViewportY, resolveOutlineItems);
  const resolvedOutlineItems = outlineItems ?? [];
  const activeIndex = useMemo(
    () => resolveActiveIndex(resolvedOutlineItems, anchorPosition),
    [anchorPosition, resolvedOutlineItems]
  );
  const { panelPaddingTop, panelPaddingBottom, setActiveItemRef, setPanelRef } = useOutlinePanelPositioning({
    activeIndex,
    anchorY,
    isOpen,
    items: resolvedOutlineItems
  });

  if (!hasOutlineCandidate) {
    return null;
  }

  return (
    <div
      aria-label="Document outline hover zone"
      className="pointer-events-auto absolute inset-y-0 right-0 z-20"
      onMouseEnter={(event) => {
        openOutline(event.clientY);
      }}
      onMouseLeave={closeOutline}
      ref={layerRef}
      style={{ right: `${OUTLINE_EDGE_CLEARANCE_PX}px`, width: `${getOutlineLayerWidth(horizontalMetrics, isOpen)}px` }}
    >
      <OutlineList
        activeIndex={activeIndex}
        horizontalMetrics={horizontalMetrics}
        isOpen={isOpen}
        items={resolvedOutlineItems}
        onRevealPosition={onRevealPosition}
        panelPaddingTop={panelPaddingTop}
        panelPaddingBottom={panelPaddingBottom}
        panelRef={setPanelRef}
        setActiveItemRef={setActiveItemRef}
      />
    </div>
  );
}
