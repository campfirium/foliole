import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { extractDocumentOutline } from '../../features/editor/model/documentOutline';
import { cn } from '../../shared/lib/utils';

interface DocumentOutlineLayerProps {
  content: string;
  onRevealSelection: (selection: EditorSelection) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
}

const HOVER_ZONE_WIDTH_PX = 72;
const OUTLINE_DEFAULT_ANCHOR_Y = 240;
const OUTLINE_EDGE_PADDING_PX = 24;

interface OutlineDisplayItem {
  from: number;
  level: number;
  text: string;
  to: number;
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
        isActive ? 'text-foreground' : 'text-foreground/42 hover:text-foreground/54',
        level === 1 ? 'font-black' : 'font-normal'
      )}
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
  isOpen,
  items,
  panelRef,
  panelTop,
  viewportHeight,
  setActiveItemRef,
  onRevealSelection
}: {
  activeIndex: number;
  isOpen: boolean;
  items: OutlineDisplayItem[];
  panelRef: (node: HTMLDivElement | null) => void;
  panelTop: number;
  viewportHeight: number;
  setActiveItemRef: (node: HTMLButtonElement | null) => void;
  onRevealSelection: (selection: EditorSelection) => void;
}) {
  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        'pointer-events-none absolute right-4 z-20 w-56 transition-all duration-150',
        isOpen ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
      )}
      ref={panelRef}
      style={{
        maxHeight: `${Math.max(0, viewportHeight - OUTLINE_EDGE_PADDING_PX * 2)}px`,
        opacity: isOpen ? 0.76 : 0,
        top: `${panelTop}px`
      }}
    >
      <nav aria-label="Document outline entries" className="pointer-events-auto overflow-hidden px-4">
        <ol className="space-y-1">
          {items.map((item, index) => (
            <li key={`${item.from}-${item.text}`}>
              <OutlineItem
                isActive={index === activeIndex}
                itemRef={index === activeIndex ? setActiveItemRef : undefined}
                level={item.level}
                onSelect={() => onRevealSelection({ from: item.from, to: item.to })}
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
  return extractDocumentOutline(content)
    .slice(1)
    .map((item) => ({ ...item, level: Math.max(1, item.level - 1) }));
}

function resolveActiveIndex(items: OutlineDisplayItem[], anchorPosition: number) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (anchorPosition >= items[index].from) {
      return index;
    }
  }
  return 0;
}

function useOutlinePanelPositioning(args: {
  activeIndex: number;
  anchorY: number;
  isOpen: boolean;
  items: OutlineDisplayItem[];
}) {
  const [panelTop, setPanelTop] = useState(OUTLINE_EDGE_PADDING_PX);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!args.isOpen || !panelRef.current || !activeItemRef.current) {
      return;
    }

    const activeTop = activeItemRef.current.offsetTop;
    const activeCenter = activeTop + activeItemRef.current.offsetHeight / 2;
    const panelHeight = panelRef.current.offsetHeight;
    const viewportHeight = panelRef.current.parentElement?.getBoundingClientRect().height ?? 0;
    const nextTop = args.anchorY - activeCenter;
    const maxTop = Math.max(OUTLINE_EDGE_PADDING_PX, viewportHeight - panelHeight - OUTLINE_EDGE_PADDING_PX);
    setPanelTop(Math.max(OUTLINE_EDGE_PADDING_PX, Math.min(maxTop, nextTop)));
  }, [args.activeIndex, args.anchorY, args.isOpen, args.items]);

  return {
    panelTop,
    setActiveItemRef: (node: HTMLButtonElement | null) => {
      activeItemRef.current = node;
    },
    setPanelRef: (node: HTMLDivElement | null) => {
      panelRef.current = node;
    }
  };
}

export function DocumentOutlineLayer({
  content,
  onRevealSelection,
  onResolveDocumentPositionAtViewportY
}: DocumentOutlineLayerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorY, setAnchorY] = useState(OUTLINE_DEFAULT_ANCHOR_Y);
  const [anchorPosition, setAnchorPosition] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const outlineItems = useMemo(() => resolveDisplayItems(content), [content]);
  const activeIndex = useMemo(() => resolveActiveIndex(outlineItems, anchorPosition), [anchorPosition, outlineItems]);
  const { panelTop, setActiveItemRef, setPanelRef } = useOutlinePanelPositioning({
    activeIndex,
    anchorY,
    isOpen,
    items: outlineItems
  });

  if (outlineItems.length === 0) {
    return null;
  }

  const openOutline = (clientY: number) => {
    if (!layerRef.current) {
      return;
    }
    const rect = layerRef.current.getBoundingClientRect();
    const nextAnchorY = clientY - rect.top;
    const nextAnchorPosition = onResolveDocumentPositionAtViewportY(clientY);
    setViewportHeight(rect.height);
    setAnchorY(Math.max(48, Math.min(rect.height - 48, nextAnchorY)));
    if (nextAnchorPosition !== null) {
      setAnchorPosition(nextAnchorPosition);
    }
    setIsOpen(true);
  };

  return (
    <div
      aria-label="Document outline hover zone"
      className="pointer-events-auto absolute inset-y-0 right-0 z-20"
      onMouseEnter={(event) => {
        openOutline(event.clientY);
      }}
      onMouseLeave={() => setIsOpen(false)}
      ref={layerRef}
      style={{ width: `${HOVER_ZONE_WIDTH_PX}px` }}
    >
      <OutlineList
        activeIndex={activeIndex}
        isOpen={isOpen}
        items={outlineItems}
        panelRef={setPanelRef}
        panelTop={panelTop}
        setActiveItemRef={setActiveItemRef}
        viewportHeight={viewportHeight}
        onRevealSelection={onRevealSelection}
      />
    </div>
  );
}
