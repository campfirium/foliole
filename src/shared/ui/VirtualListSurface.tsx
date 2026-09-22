import type { VirtualItem } from '@tanstack/react-virtual';
import { Fragment, useMemo, useRef, type ReactNode, type RefObject } from 'react';

import { useVirtualListPosition } from './useVirtualListPosition';
import type { VirtualListPosition } from './virtualListPosition';
import { VirtualListSurfaceVirtual } from './VirtualListSurfaceVirtual';
export { resolveComfortScrollTop } from './virtualListScrollModel';

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
  autoScroll?: boolean;
  className?: string;
  enabled?: boolean;
  measureItems?: boolean;
  position?: VirtualListPosition;
  accountForOffset?: boolean;
  pinnedItemKey?: string | null;
  overscan?: number;
  scrollAnchorIndex?: number | null;
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

export function VirtualListSurface<TItem>({
  autoScroll = true,
  className,
  enabled = true,
  estimateSize,
  getItemKey,
  items,
  measureItems = false,
  position,
  accountForOffset = false,
  pinnedItemKey,
  overscan = DEFAULT_VIRTUAL_LIST_OVERSCAN,
  renderItem,
  scrollAnchorIndex,
  scrollToIndex,
  scrollElementRef,
  threshold = DEFAULT_VIRTUAL_LIST_THRESHOLD
}: VirtualListSurfaceProps<TItem>) {
  const isVirtual = enabled && shouldVirtualizeList(items.length, threshold);

  if (!isVirtual) {
    return position ? <PositionedStaticList items={items} getItemKey={getItemKey} position={position}
      scrollElementRef={scrollElementRef} renderItem={(item, meta) => renderItem(item, meta)} estimateSize={estimateSize} />
      : <>{renderStaticItems(items, estimateSize, getItemKey, renderItem)}</>;
  }

  return (
    <VirtualListSurfaceVirtual
      autoScroll={autoScroll}
      accountForOffset={accountForOffset}
      {...(position ? { position } : {})}
      {...(pinnedItemKey !== undefined ? { pinnedItemKey } : {})}
      estimateSize={estimateSize}
      getItemKey={getItemKey}
      items={items}
      measureItems={measureItems}
      overscan={overscan}
      renderItem={renderItem}
      scrollElementRef={scrollElementRef}
      {...(className !== undefined ? { className } : {})}
      {...(scrollAnchorIndex !== undefined ? { scrollAnchorIndex } : {})}
      {...(scrollToIndex !== undefined ? { scrollToIndex } : {})}
    />
  );
}

function PositionedStaticList<TItem>(props: Pick<VirtualListSurfaceProps<TItem>,
  'items' | 'getItemKey' | 'position' | 'scrollElementRef' | 'renderItem' | 'estimateSize'>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const keys = useMemo(() => props.items.map(props.getItemKey), [props.items, props.getItemKey]);
  useVirtualListPosition({ keys, position: props.position, rootRef, scrollElementRef: props.scrollElementRef });
  return <div ref={rootRef}>{renderStaticItems(props.items, props.estimateSize, props.getItemKey,
    (item, meta) => <div data-list-position-index={meta.index}>{props.renderItem(item, meta)}</div>)}</div>;
}
