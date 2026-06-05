import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import type { OutlineDisplayItem, OutlineHorizontalMetrics } from './DocumentOutlineLayerModel';

const OUTLINE_VISIBLE_OPACITY = 0.8;
const OUTLINE_PANEL_TOP_PX = 96;
const OUTLINE_PANEL_BOTTOM_PX = 56;

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

export function OutlineList({
  activeIndex,
  horizontalMetrics,
  isOpen,
  items,
  onRevealPosition,
  panelRef,
  setActiveItemRef
}: {
  activeIndex: number;
  horizontalMetrics: OutlineHorizontalMetrics;
  isOpen: boolean;
  items: OutlineDisplayItem[];
  onRevealPosition: (position: number) => void;
  panelRef: (node: HTMLDivElement | null) => void;
  setActiveItemRef: (node: HTMLButtonElement | null) => void;
}) {
  const t = useTranslation();
  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        'scrollbar-hidden pointer-events-auto absolute overflow-y-auto transition-all duration-150',
        isOpen ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
      )}
      ref={panelRef}
      style={{
        bottom: `${OUTLINE_PANEL_BOTTOM_PX}px`,
        opacity: isOpen ? OUTLINE_VISIBLE_OPACITY : 0,
        right: `${horizontalMetrics.panelRight}px`,
        top: `${OUTLINE_PANEL_TOP_PX}px`,
        width: `${horizontalMetrics.panelWidth}px`
      }}
    >
      <nav aria-label={t('desktop.document.outline')} className="py-1">
        <ol className="m-0 list-none space-y-1 p-0">
          {items.map((item, index) => (
            <li key={`${item.from}-${item.text}`}>
              <OutlineItem
                isActive={index === activeIndex}
                {...(index === activeIndex ? { itemRef: setActiveItemRef } : {})}
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
