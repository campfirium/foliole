import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { extractDocumentOutline } from '../../features/editor/model/documentOutline';
import { cn } from '../../shared/lib/utils';

interface DocumentOutlineLayerProps {
  content: string;
  documentMaxWidth: number;
  onRevealPosition: (position: number) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
}

const HOVER_ZONE_WIDTH_PX = 72;
const OUTLINE_DEFAULT_ANCHOR_Y = 240;
const OUTLINE_RIGHT_GAP_RATIO = 0.1;
const OUTLINE_VISIBLE_OPACITY = 0.8;

interface OutlineDisplayItem {
  from: number;
  level: number;
  text: string;
  to: number;
}

interface OutlineHorizontalMetrics {
  panelRight: number;
  panelWidth: number;
}

function resolveOutlineHorizontalMetrics(containerWidth: number, documentMaxWidth: number): OutlineHorizontalMetrics {
  const visibleDocumentWidth = Math.min(containerWidth, documentMaxWidth);
  const splitterOffset = Math.max(0, (containerWidth - visibleDocumentWidth) / 2 - 5);
  const panelRight = splitterOffset * OUTLINE_RIGHT_GAP_RATIO;
  const panelWidth = Math.max(0, splitterOffset - panelRight);

  return {
    panelRight,
    panelWidth
  };
}

function getOutlineLayerWidth(horizontalMetrics: OutlineHorizontalMetrics, isOpen: boolean) {
  if (!isOpen) {
    return HOVER_ZONE_WIDTH_PX;
  }
  return Math.max(HOVER_ZONE_WIDTH_PX, horizontalMetrics.panelWidth + horizontalMetrics.panelRight + HOVER_ZONE_WIDTH_PX);
}

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
  panelPaddingBottom,
  panelRef,
  setActiveItemRef
}: {
  activeIndex: number;
  horizontalMetrics: OutlineHorizontalMetrics;
  isOpen: boolean;
  items: OutlineDisplayItem[];
  onRevealPosition: (position: number) => void;
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
        style={{ paddingBottom: `${panelPaddingBottom}px` }}
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

function resolveDisplayItems(content: string): OutlineDisplayItem[] {
  const visibleItems = extractDocumentOutline(content).slice(1);
  const baseLevel = visibleItems.reduce((minLevel, item) => Math.min(minLevel, item.level), Number.POSITIVE_INFINITY);

  return visibleItems.map((item) => ({
    ...item,
    level: Math.max(1, item.level - baseLevel + 1)
  }));
}

function resolveActiveIndex(items: OutlineDisplayItem[], anchorPosition: number) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (anchorPosition >= items[index].from) {
      return index;
    }
  }
  return 0;
}

export function resolvePanelScrollTop(anchorY: number, activeTop: number, panelHeight: number, scrollHeight: number) {
  const maxScrollTop = Math.max(0, scrollHeight - panelHeight);
  return Math.max(0, Math.min(maxScrollTop, activeTop - anchorY));
}

function useOutlinePanelPositioning(args: {
  activeIndex: number;
  anchorY: number;
  isOpen: boolean;
  items: OutlineDisplayItem[];
}) {
  const [panelPaddingBottom, setPanelPaddingBottom] = useState(0);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!args.isOpen || !panelRef.current || !activeItemRef.current) {
      return;
    }

    const activeTop = activeItemRef.current.offsetTop;
    const panelHeight = panelRef.current.offsetHeight;
    const scrollHeight = panelRef.current.scrollHeight;
    setPanelPaddingBottom(panelHeight);
    panelRef.current.scrollTop = resolvePanelScrollTop(args.anchorY, activeTop, panelHeight, scrollHeight);
  }, [args.activeIndex, args.anchorY, args.isOpen, args.items]);

  return {
    panelPaddingBottom,
    setActiveItemRef: (node: HTMLButtonElement | null) => {
      activeItemRef.current = node;
    },
    setPanelRef: (node: HTMLDivElement | null) => {
      panelRef.current = node;
    }
  };
}

function useOutlineHoverState(documentMaxWidth: number, onResolveDocumentPositionAtViewportY: (clientY: number) => number | null) {
  const [anchorY, setAnchorY] = useState(OUTLINE_DEFAULT_ANCHOR_Y);
  const [anchorPosition, setAnchorPosition] = useState(0);
  const [horizontalMetrics, setHorizontalMetrics] = useState<OutlineHorizontalMetrics>({
    panelRight: 0,
    panelWidth: HOVER_ZONE_WIDTH_PX
  });
  const [isOpen, setIsOpen] = useState(false);
  const layerRef = useRef<HTMLDivElement | null>(null);

  const openOutline = (clientY: number) => {
    if (!layerRef.current) {
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
  };

  return {
    anchorPosition,
    anchorY,
    horizontalMetrics,
    isOpen,
    layerRef,
    openOutline,
    setIsOpen
  };
}

export function DocumentOutlineLayer({
  content,
  documentMaxWidth,
  onRevealPosition,
  onResolveDocumentPositionAtViewportY
}: DocumentOutlineLayerProps) {
  const { anchorPosition, anchorY, horizontalMetrics, isOpen, layerRef, openOutline, setIsOpen } =
    useOutlineHoverState(documentMaxWidth, onResolveDocumentPositionAtViewportY);
  const outlineItems = useMemo(() => resolveDisplayItems(content), [content]);
  const activeIndex = useMemo(() => resolveActiveIndex(outlineItems, anchorPosition), [anchorPosition, outlineItems]);
  const { panelPaddingBottom, setActiveItemRef, setPanelRef } = useOutlinePanelPositioning({
    activeIndex,
    anchorY,
    isOpen,
    items: outlineItems
  });

  if (outlineItems.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Document outline hover zone"
      className="pointer-events-auto absolute inset-y-0 right-0 z-20"
      onMouseEnter={(event) => {
        openOutline(event.clientY);
      }}
      onMouseLeave={() => setIsOpen(false)}
      ref={layerRef}
      style={{ width: `${getOutlineLayerWidth(horizontalMetrics, isOpen)}px` }}
    >
      <OutlineList
        activeIndex={activeIndex}
        horizontalMetrics={horizontalMetrics}
        isOpen={isOpen}
        items={outlineItems}
        onRevealPosition={onRevealPosition}
        panelPaddingBottom={panelPaddingBottom}
        panelRef={setPanelRef}
        setActiveItemRef={setActiveItemRef}
      />
    </div>
  );
}
