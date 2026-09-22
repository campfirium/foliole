import { defaultRangeExtractor, useVirtualizer, type Range, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type ReactNode, type RefObject } from 'react';

import { resolveComfortScrollTop } from './virtualListScrollModel';
import type { VirtualListRenderMeta } from './VirtualListSurface';
import { useVirtualListViewportRemeasure } from './virtualListViewportRemeasure';

interface VirtualListSurfaceVirtualProps<TItem> {
  autoScroll: boolean;
  className?: string;
  estimateSize: (index: number) => number;
  getItemKey: (item: TItem) => string;
  items: readonly TItem[];
  measureItems: boolean;
  overscan: number;
  renderItem: (item: TItem, meta: VirtualListRenderMeta) => ReactNode;
  scrollAnchorIndex?: number | null;
  scrollElementRef: RefObject<HTMLElement | null>;
  scrollToIndex?: number | null;
}

function renderVirtualItems<TItem>(
  items: readonly TItem[],
  virtualItems: VirtualItem[],
  renderItem: (item: TItem, meta: VirtualListRenderMeta) => ReactNode,
  measureElement?: (element: Element | null) => void
) {
  return virtualItems.map((virtualItem) => {
    const item = items[virtualItem.index] as TItem;
    return (
      <div
        data-index={virtualItem.index}
        key={virtualItem.key}
        ref={measureElement}
        style={{ left: 0, position: 'absolute', top: 0, transform: `translateY(${virtualItem.start}px)`, width: '100%' }}
      >
        {renderItem(item, {
          ariaPosInSet: virtualItem.index + 1,
          ariaSetSize: items.length,
          index: virtualItem.index,
          virtualItem
        })}
      </div>
    );
  });
}

function useVirtualListEndPin(args: {
  enabled: boolean;
  scrollElementRef: RefObject<HTMLElement | null>;
}): MutableRefObject<boolean> {
  const pinnedToEndRef = useRef(false);
  useLayoutEffect(() => {
    const scrollElement = args.scrollElementRef.current;
    if (!args.enabled || !scrollElement) return;
    const updatePinnedState = () => {
      const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
      if (maxScrollTop - scrollElement.scrollTop <= 2) {
        pinnedToEndRef.current = true;
      }
    };
    const releaseEndPin = () => { pinnedToEndRef.current = false; };
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) releaseEndPin();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'Home', 'PageUp'].includes(event.key)) releaseEndPin();
    };
    updatePinnedState();
    scrollElement.addEventListener('scroll', updatePinnedState, { passive: true });
    scrollElement.addEventListener('wheel', handleWheel, { passive: true });
    scrollElement.addEventListener('keydown', handleKeyDown);
    scrollElement.addEventListener('pointerdown', releaseEndPin, { passive: true });
    scrollElement.addEventListener('touchstart', releaseEndPin, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', updatePinnedState);
      scrollElement.removeEventListener('wheel', handleWheel);
      scrollElement.removeEventListener('keydown', handleKeyDown);
      scrollElement.removeEventListener('pointerdown', releaseEndPin);
      scrollElement.removeEventListener('touchstart', releaseEndPin);
    };
  }, [args.enabled, args.scrollElementRef]);
  return pinnedToEndRef;
}

function scheduleEndPin(
  enabled: boolean,
  pinnedToEndRef: MutableRefObject<boolean>,
  scrollElementRef: RefObject<HTMLElement | null>
) {
  if (!enabled || !pinnedToEndRef.current) return;
  requestAnimationFrame(() => {
    const scrollElement = scrollElementRef.current;
    if (pinnedToEndRef.current && scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  });
}

function useComfortVirtualListScroll(args: {
  autoScroll: boolean;
  scrollAnchorIndex: number | null | undefined;
  scrollElementRef: RefObject<HTMLElement | null>;
  scrollToIndex: number | null | undefined;
  scrollToKey: string | null;
  virtualizer: Virtualizer<HTMLElement, Element>;
}) {
  const appliedRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (!args.autoScroll || args.scrollToIndex === null || args.scrollToIndex === undefined || args.scrollToIndex < 0) {
      appliedRequestRef.current = null;
      return;
    }
    const requestKey = `${args.scrollToKey ?? 'unknown'}:${args.scrollToIndex}`;
    if (appliedRequestRef.current === requestKey) return;
    appliedRequestRef.current = requestKey;
    if (args.scrollAnchorIndex !== null && args.scrollAnchorIndex !== undefined && args.scrollAnchorIndex >= 0) {
      const anchorItem = args.virtualizer.getVirtualItems().find((item) => item.index === args.scrollAnchorIndex);
      if (anchorItem) {
        args.virtualizer.scrollToOffset(anchorItem.start);
        return;
      }
      args.virtualizer.scrollToIndex(args.scrollAnchorIndex, { align: 'start' });
      return;
    }
    const scrollElement = args.scrollElementRef.current;
    const virtualItem = args.virtualizer.getVirtualItems().find((item) => item.index === args.scrollToIndex);
    if (!scrollElement || !virtualItem) {
      args.virtualizer.scrollToIndex(args.scrollToIndex, { align: 'center' });
      return;
    }
    const nextScrollTop = resolveComfortScrollTop({
      containerHeight: scrollElement.clientHeight,
      currentScrollTop: scrollElement.scrollTop,
      itemEnd: virtualItem.end,
      itemStart: virtualItem.start,
      maxScrollTop: Math.max(0, args.virtualizer.getTotalSize() - scrollElement.clientHeight)
    });
    if (nextScrollTop !== null) {
      args.virtualizer.scrollToOffset(nextScrollTop);
    }
  }, [args.autoScroll, args.scrollAnchorIndex, args.scrollElementRef, args.scrollToIndex, args.scrollToKey, args.virtualizer]);
}

export function VirtualListSurfaceVirtual<TItem>(props: VirtualListSurfaceVirtualProps<TItem>) {
  const getScrollElement = useCallback(() => props.scrollElementRef.current, [props.scrollElementRef]);
  const pinnedToEndRef = useVirtualListEndPin({
    enabled: props.measureItems,
    scrollElementRef: props.scrollElementRef
  });
  const rangeExtractor = useMemo(
    () => (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      const pinnedIndexes = [props.scrollToIndex, props.scrollAnchorIndex].filter(
        (index): index is number => index !== null && index !== undefined && index >= 0
      );
      return pinnedIndexes.length === 0 ? indexes : [...new Set([...indexes, ...pinnedIndexes])].sort((a, b) => a - b);
    },
    [props.scrollAnchorIndex, props.scrollToIndex]
  );
  const virtualizer = useVirtualizer({
    count: props.items.length,
    estimateSize: props.estimateSize,
    getItemKey: (index) => props.getItemKey(props.items[index] as TItem),
    getScrollElement,
    initialRect: { height: props.estimateSize(0) * 12, width: 0 },
    onChange: () => scheduleEndPin(props.measureItems, pinnedToEndRef, props.scrollElementRef),
    overscan: props.overscan,
    rangeExtractor,
    useAnimationFrameWithResizeObserver: true
  });
  const scrollToKey =
    props.scrollToIndex !== null && props.scrollToIndex !== undefined && props.scrollToIndex >= 0 && props.scrollToIndex < props.items.length
      ? props.getItemKey(props.items[props.scrollToIndex] as TItem)
      : null;

  useComfortVirtualListScroll({
    autoScroll: props.autoScroll,
    scrollAnchorIndex: props.scrollAnchorIndex,
    scrollElementRef: props.scrollElementRef,
    scrollToIndex: props.scrollToIndex,
    scrollToKey,
    virtualizer
  });
  useVirtualListViewportRemeasure({ isVirtual: true, virtualizer });
  const totalSize = virtualizer.getTotalSize();

  return (
    <div className={props.className} data-virtual-list="true" style={{ height: `${totalSize}px`, position: 'relative', width: '100%' }}>
      {renderVirtualItems(
        props.items,
        virtualizer.getVirtualItems(),
        props.renderItem,
        props.measureItems ? virtualizer.measureElement : undefined
      )}
    </div>
  );
}
