import { useMemo } from 'react';

import { cn } from '../../shared/lib/utils';
import { AppEmptyState } from '../../shared/ui';

import { mayHaveOutline, resolveActiveIndex, resolveDisplayItems } from './DocumentOutlineLayerModel';

interface WorkspaceRightSidebarOutlinePanelProps {
  activePosition: number;
  content: string;
  onRevealPosition: (position: number) => void;
}

function renderLevelGuides(level: number) {
  return Array.from({ length: Math.max(1, level) }, (_, index) => (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/[0.13]',
        index === 0 ? 'border-foreground/[0.18]' : ''
      )}
      key={index}
      style={{ left: `${0.65 + index * 1.35}rem` }}
    />
  ));
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

function getAccentTone(level: number, isActive: boolean) {
  if (isActive) {
    return 'bg-[rgb(var(--app-accent-color-rgb)/0.88)] opacity-100';
  }
  if (level === 1) {
    return 'bg-[rgb(var(--app-accent-color-rgb)/0.72)] opacity-90';
  }
  if (level === 2) {
    return 'bg-[rgb(var(--app-accent-color-rgb)/0.56)] opacity-80';
  }
  return 'bg-foreground/24 opacity-0 group-hover:opacity-70';
}

export function WorkspaceRightSidebarOutlinePanel({
  activePosition,
  content,
  onRevealPosition
}: WorkspaceRightSidebarOutlinePanelProps) {
  const outlineItems = useMemo(() => (mayHaveOutline(content) ? resolveDisplayItems(content) : []), [content]);
  const activeIndex = useMemo(() => resolveActiveIndex(outlineItems, activePosition), [activePosition, outlineItems]);
  const hasNestedLevels = useMemo(() => outlineItems.some((item) => item.level > 1), [outlineItems]);

  if (outlineItems.length === 0) {
    return (
      <AppEmptyState
        description="Headings in the current topic will appear here."
        title="No outline"
      />
    );
  }

  return (
    <nav aria-label="Document outline" className="relative min-h-full px-1 py-1">
      <ol className="relative m-0 list-none space-y-0.5 p-0">
        {outlineItems.map((item, index) => (
          <li className="relative" key={`${item.from}-${item.text}`}>
            {hasNestedLevels ? renderLevelGuides(item.level) : null}
            <button
              aria-current={index === activeIndex ? 'location' : undefined}
              className={cn(
                'group relative flex min-h-8 w-full items-center rounded-md py-1.5 pr-2 text-left text-sm font-normal leading-snug transition-colors',
                'hover:bg-foreground/[0.055] hover:text-foreground focus-visible:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                index === activeIndex ? 'bg-[rgb(var(--app-accent-color-rgb)/0.22)] shadow-[inset_0_0_0_1px_rgb(var(--app-accent-color-rgb)/0.08)]' : '',
                getOutlineItemTone(item.level, index === activeIndex)
              )}
              onClick={() => onRevealPosition(item.from)}
              style={{ paddingLeft: hasNestedLevels ? `${1.3 + (item.level - 1) * 1.35}rem` : '0.75rem' }}
              type="button"
            >
              {hasNestedLevels ? (
                <span
                  aria-hidden="true"
                  className={cn('absolute top-2 h-[calc(100%-1rem)] w-1 rounded-full transition-opacity', getAccentTone(item.level, index === activeIndex))}
                  style={{ left: `${0.5 + (item.level - 1) * 1.35}rem` }}
                />
              ) : null}
              <span className="line-clamp-2">{item.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
