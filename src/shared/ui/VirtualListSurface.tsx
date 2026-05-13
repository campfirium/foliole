import { defaultRangeExtractor, useVirtualizer, type Range, type VirtualItem } from '@tanstack/react-virtual';
import { useCallback, useMemo, useEffect, type ReactNode, type RefObject } from 'react';

const DEFAULT_VIRTUAL_LIST_THRESHOLD = 100;
const DEFAULT_VIRTUAL_LIST_OVERSCAN = 8;

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
  className?: string;
  enabled?: boolean;
  overscan?: number;
  scrollToIndex?: number | null;
  threshold?: number;
}

export function shouldVirtualizeList(length: number, threshold = DEFAULT_VIRTUAL_LIST_THRESHOLD) {
  return length >= threshold;
}

function renderStaticItems<TItem>(
  items: readonly TItem[],
  estimateSize: (index: number) => number,
  getItemKey: (item: TItem) => string,
  renderItem: (item: TItem, meta: VirtualListRenderMeta) => ReactNode
) {
  return items.map((item, index) =>
    renderItem(item, {
      ariaPosInSet: index + 1,
      ariaSetSize: items.length,
      index,
      virtualItem: {
        end: 0,
        index,
        key: getItemKey(item),
        lane: 0,
        size: estimateSize(index),
        start: 0
      }
    })
  );
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

export function VirtualListSurface<TItem>({
  className,
  enabled = true,
  estimateSize,
  getItemKey,
  items,
  overscan = DEFAULT_VIRTUAL_LIST_OVERSCAN,
  renderItem,
  scrollToIndex,
  scrollElementRef,
  threshold = DEFAULT_VIRTUAL_LIST_THRESHOLD
}: VirtualListSurfaceProps<TItem>) {
  const isVirtual = enabled && shouldVirtualizeList(items.length, threshold);
  const getScrollElement = useCallback(() => scrollElementRef.current, [scrollElementRef]);
  const rangeExtractor = useMemo(
    () => (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (scrollToIndex === null || scrollToIndex === undefined || scrollToIndex < 0) {
        return indexes;
      }
      return indexes.includes(scrollToIndex) ? indexes : [...indexes, scrollToIndex].sort((a, b) => a - b);
    },
    [scrollToIndex]
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

  useEffect(() => {
    if (isVirtual && scrollToIndex !== null && scrollToIndex !== undefined && scrollToIndex >= 0) {
      virtualizer.scrollToIndex(scrollToIndex, { align: 'auto' });
    }
  }, [isVirtual, scrollToIndex, virtualizer]);

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
