import { defaultRangeExtractor, useVirtualizer, type Range, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import { Fragment, useCallback, useMemo, useEffect, useRef, type ReactNode, type RefObject } from 'react';

const DEFAULT_VIRTUAL_LIST_THRESHOLD = 100;
const DEFAULT_VIRTUAL_LIST_OVERSCAN = 8;
const COMFORT_SCROLL_ANCHOR_RATIO = 0.38;

export interface VirtualListRenderMeta {
  ariaPosInSet: number;
  ariaSetSize: number;
  index: number;
  virtualItem: VirtualItem;
}

interface VirtualListSurfaceProps<TItem> {
  estimateSize: (index: number) => number;
  getItemKey: (item: TItem) => string;
  items: readonly TItem[];
  renderItem: (item: TItem, meta: VirtualListRenderMeta) => ReactNode;
  scrollElementRef: RefObject<HTMLElement | null>;
  autoScroll?: boolean;
  className?: string;
  enabled?: boolean;
  overscan?: number;
  scrollAnchorIndex?: number | null;
  scrollToIndex?: number | null;
  threshold?: number;
}

export function shouldVirtualizeList(length: number, threshold = DEFAULT_VIRTUAL_LIST_THRESHOLD) {
  return length >= threshold;
}

export function resolveComfortScrollTop(args: {
  containerHeight: number;
  currentScrollTop: number;
  itemEnd: number;
  itemStart: number;
  maxScrollTop: number;
}) {
  const viewportBottom = args.currentScrollTop + args.containerHeight;
  if (args.itemEnd > args.currentScrollTop && args.itemStart < viewportBottom) {
    return null;
  }
  const targetTop = args.itemStart - args.containerHeight * COMFORT_SCROLL_ANCHOR_RATIO;
  return Math.max(0, Math.min(targetTop, args.maxScrollTop));
}

function renderStaticItems<TItem>(
  items: readonly TItem[],
  estimateSize: (index: number) => number,
  getItemKey: (item: TItem) => string,
  renderItem: (item: TItem, meta: VirtualListRenderMeta) => ReactNode
) {
  return items.map((item, index) => {
    const key = getItemKey(item);
    return (
      <Fragment key={key}>
        {renderItem(item, {
          ariaPosInSet: index + 1,
          ariaSetSize: items.length,
          index,
          virtualItem: {
            end: 0,
            index,
            key,
            lane: 0,
            size: estimateSize(index),
            start: 0
          }
        })}
      </Fragment>
    );
  });
}

function renderVirtualItems<TItem>(
  items: readonly TItem[],
  virtualItems: VirtualItem[],
  renderItem: (item: TItem, meta: VirtualListRenderMeta) => ReactNode
) {
  return virtualItems.map((virtualItem) => {
    const item = items[virtualItem.index] as TItem;
    return (
      <div
        data-index={virtualItem.index}
        key={virtualItem.key}
        style={{
          left: 0,
          position: 'absolute',
          top: 0,
          transform: `translateY(${virtualItem.start}px)`,
          width: '100%'
        }}
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

function useComfortVirtualListScroll(args: {
  autoScroll: boolean;
  isVirtual: boolean;
  scrollAnchorIndex: number | null | undefined;
  scrollElementRef: RefObject<HTMLElement | null>;
  scrollToIndex: number | null | undefined;
  scrollToKey: string | null;
  virtualizer: Virtualizer<HTMLElement, Element>;
}) {
  const appliedRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (!args.autoScroll || !args.isVirtual || args.scrollToIndex === null || args.scrollToIndex === undefined || args.scrollToIndex < 0) {
      appliedRequestRef.current = null;
      return;
    }
    const requestKey = `${args.scrollToKey ?? 'unknown'}:${args.scrollToIndex}`;
    if (appliedRequestRef.current === requestKey) {
      return;
    }
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
  }, [args.autoScroll, args.isVirtual, args.scrollAnchorIndex, args.scrollElementRef, args.scrollToIndex, args.scrollToKey, args.virtualizer]);
}

export function VirtualListSurface<TItem>({
  autoScroll = true,
  className,
  enabled = true,
  estimateSize,
  getItemKey,
  items,
  overscan = DEFAULT_VIRTUAL_LIST_OVERSCAN,
  renderItem,
  scrollAnchorIndex,
  scrollToIndex,
  scrollElementRef,
  threshold = DEFAULT_VIRTUAL_LIST_THRESHOLD
}: VirtualListSurfaceProps<TItem>) {
  const isVirtual = enabled && shouldVirtualizeList(items.length, threshold);
  const getScrollElement = useCallback(() => scrollElementRef.current, [scrollElementRef]);
  const rangeExtractor = useMemo(
    () => (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      const pinnedIndexes = [scrollToIndex, scrollAnchorIndex].filter(
        (index): index is number => index !== null && index !== undefined && index >= 0
      );
      if (pinnedIndexes.length === 0) {
        return indexes;
      }
      return [...new Set([...indexes, ...pinnedIndexes])].sort((a, b) => a - b);
    },
    [scrollAnchorIndex, scrollToIndex]
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    enabled: isVirtual,
    estimateSize,
    getItemKey: (index) => getItemKey(items[index] as TItem),
    getScrollElement,
    initialRect: { height: estimateSize(0) * 12, width: 0 },
    overscan,
    rangeExtractor,
    useAnimationFrameWithResizeObserver: true
  });
  const scrollToKey =
    scrollToIndex !== null && scrollToIndex !== undefined && scrollToIndex >= 0 && scrollToIndex < items.length
      ? getItemKey(items[scrollToIndex] as TItem)
      : null;

  useComfortVirtualListScroll({ autoScroll, isVirtual, scrollAnchorIndex, scrollElementRef, scrollToIndex, scrollToKey, virtualizer });

  if (!isVirtual) {
    return renderStaticItems(items, estimateSize, getItemKey, renderItem);
  }

  return (
    <div
      className={className}
      data-virtual-list="true"
      style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}
    >
      {renderVirtualItems(items, virtualizer.getVirtualItems(), renderItem)}
    </div>
  );
}
