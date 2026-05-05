import { ChevronDown } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef } from 'react';

import { cn } from '../../shared/lib/utils';

import { mayHaveOutline, resolveActiveIndex, resolveDisplayItems } from './DocumentOutlineLayerModel';

const OUTLINE_SCROLL_MARGIN_PX = 32;

interface WorkspaceRightSidebarOutlinePanelProps {
  activePosition: number;
  content: string;
  onRevealPosition: (position: number) => void;
}

function getOutlineItemTone(level: number, isActive: boolean) {
  if (isActive) {
    return 'text-foreground';
  }
  if (level === 1) {
    return 'text-foreground/86';
  }
  if (level === 2) {
    return 'text-foreground/74';
  }
  return 'text-foreground/64';
}

function getScrollParent(element: HTMLElement) {
  let parent = element.parentElement;
  while (parent) {
    if (parent.classList.contains('app-scrollbar')) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function resolveOutlineTreeItems(items: ReturnType<typeof resolveDisplayItems>) {
  return items.map((item, index) => ({
    ...item,
    hasChildren: (items[index + 1]?.level ?? 0) > item.level
  }));
}

export function resolveOutlineActiveScrollTop(args: {
  containerBottom: number;
  containerClientHeight: number;
  containerScrollHeight: number;
  containerScrollTop: number;
  containerTop: number;
  itemBottom: number;
  itemTop: number;
  margin: number;
}) {
  const maxScrollTop = Math.max(0, args.containerScrollHeight - args.containerClientHeight);
  const visibleTop = args.containerTop + args.margin;
  const visibleBottom = args.containerBottom - args.margin;
  const itemHeight = args.itemBottom - args.itemTop;
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  let nextScrollTop = args.containerScrollTop;

  if (itemHeight > visibleHeight || args.itemTop < visibleTop) {
    nextScrollTop += args.itemTop - visibleTop;
  } else if (args.itemBottom > visibleBottom) {
    nextScrollTop += args.itemBottom - visibleBottom;
  }

  return Math.max(0, Math.min(maxScrollTop, nextScrollTop));
}

export function scrollActiveOutlineItemIntoView(activeItem: HTMLElement) {
  const scrollParent = getScrollParent(activeItem);
  if (!scrollParent) {
    return;
  }
  const containerRect = scrollParent.getBoundingClientRect();
  const itemRect = activeItem.getBoundingClientRect();
  const margin = Math.min(OUTLINE_SCROLL_MARGIN_PX, scrollParent.clientHeight / 4);
  const nextScrollTop = resolveOutlineActiveScrollTop({
    containerBottom: containerRect.bottom,
    containerClientHeight: scrollParent.clientHeight,
    containerScrollHeight: scrollParent.scrollHeight,
    containerScrollTop: scrollParent.scrollTop,
    containerTop: containerRect.top,
    itemBottom: itemRect.bottom,
    itemTop: itemRect.top,
    margin
  });

  if (nextScrollTop !== scrollParent.scrollTop) {
    scrollParent.scrollTop = nextScrollTop;
  }
}

export function WorkspaceRightSidebarOutlinePanel({
  activePosition,
  content,
  onRevealPosition
}: WorkspaceRightSidebarOutlinePanelProps) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const outlineItems = useMemo(() => (mayHaveOutline(content) ? resolveDisplayItems(content) : []), [content]);
  const treeItems = useMemo(() => resolveOutlineTreeItems(outlineItems), [outlineItems]);
  const activeIndex = useMemo(() => resolveActiveIndex(outlineItems, activePosition), [activePosition, outlineItems]);
  const hasNestedLevels = useMemo(() => treeItems.some((item) => item.level > 1), [treeItems]);

  useLayoutEffect(() => {
    if (activeItemRef.current) {
      scrollActiveOutlineItemIntoView(activeItemRef.current);
    }
  }, [activeIndex]);

  if (outlineItems.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Document outline" className="relative min-h-full px-1 py-1">
      <ol className="relative m-0 list-none p-0">
        {treeItems.map((item, index) => (
          <li className="relative" key={`${item.from}-${item.text}`}>
            <button
              aria-current={index === activeIndex ? 'location' : undefined}
              className={cn(
                'group relative flex min-h-7 w-full items-center rounded-md py-1 pr-2 text-left text-[13px] font-normal leading-5 transition-colors',
                'hover:bg-foreground/[0.055] hover:text-foreground focus-visible:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                index === activeIndex ? 'bg-[rgb(var(--app-accent-color-rgb)/0.22)] shadow-[inset_0_0_0_1px_rgb(var(--app-accent-color-rgb)/0.08)]' : '',
                getOutlineItemTone(item.level, index === activeIndex)
              )}
              onClick={() => onRevealPosition(item.from)}
              ref={index === activeIndex ? activeItemRef : undefined}
              style={{ paddingLeft: hasNestedLevels ? `${0.45 + (item.level - 1) * 1.15}rem` : '0.75rem' }}
              type="button"
            >
              {hasNestedLevels ? (
                <span
                  aria-hidden="true"
                  className="mr-1 flex size-4 shrink-0 items-center justify-center text-foreground/42"
                >
                  {item.hasChildren ? <ChevronDown size={14} strokeWidth={2.1} /> : null}
                </span>
              ) : null}
              <span className="line-clamp-2">{item.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
