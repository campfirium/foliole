import { CirclePlus } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { HelpKnowledgeItem } from '../../features/help/model/helpKnowledge';
import type { SettingsSearchResult } from '../../features/settings/model/settingsSearch';
import type { CommandMenuSection } from '../../shared/commands/menuModel';
import { formatShortcutSetDisplayLabel } from '../../shared/commands/shortcutDisplay';
import { formatAriaKeyShortcuts } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName
} from '../../shared/ui';
import { floatingResultListClassName } from '../../shared/ui/FloatingSurface';

export interface PaletteResult extends CommandPaletteItem {
  setting?: SettingsSearchResult;
  subtitle?: string;
  tip?: HelpKnowledgeItem;
}

export interface PaletteSection extends CommandMenuSection {
  items: PaletteResult[];
}

interface CommandPaletteListProps {
  activeIndex: number;
  activeItems: PaletteResult[];
  displaySections: PaletteSection[];
  emptyLabel: string;
  expandedTipId: string | null;
  onConfigureItem: (item: CommandPaletteItem) => void;
  onRunItem: (item: PaletteResult | undefined) => void;
}

function CommandPaletteRow(props: {
  active: boolean;
  expanded: boolean;
  item: PaletteResult;
  onConfigureItem: CommandPaletteListProps['onConfigureItem'];
  onRunItem: CommandPaletteListProps['onRunItem'];
}) {
  const t = useTranslation();
  const shortcutLabel = formatShortcutSetDisplayLabel(props.item.shortcuts);
  return (
    <div
      className={appFloatingItemClassName('flex items-stretch p-0 text-sm')}
      data-active={props.active}
      data-disabled={!props.item.enabled}
    >
      <button
        aria-expanded={props.item.tip ? props.expanded : undefined}
        aria-keyshortcuts={formatAriaKeyShortcuts(props.item.shortcuts)}
        aria-label={props.item.subtitle && (props.item.setting || props.item.tip) ? `${props.item.title} — ${props.item.subtitle}` : props.item.title}
        className="min-w-0 flex-1 px-3 py-2 text-left"
        disabled={!props.item.enabled}
        onClick={() => props.onRunItem(props.item)}
        type="button"
      >
        <span className="block truncate font-medium text-[color:var(--role-floating-text-primary)]">{props.item.title}</span>
        {props.item.subtitle ? (
          <span className="block truncate text-xs text-[color:var(--role-floating-text-muted)]">{props.item.subtitle}</span>
        ) : null}
      </button>
      {props.item.setting || props.item.tip ? null : (
        <button
          aria-label={t('desktop.palette.command.configureShortcut', { title: props.item.title })}
          className="flex shrink-0 items-center px-3 text-[color:var(--role-floating-text-muted)] hover:text-[color:var(--role-floating-text-primary)] focus-visible:text-[color:var(--role-floating-text-primary)]"
          onClick={() => props.onConfigureItem(props.item)}
          type="button"
        >
          {shortcutLabel ? <span className="text-xs">{shortcutLabel}</span> : <CirclePlus aria-hidden="true" size={16} strokeWidth={1.8} />}
        </button>
      )}
    </div>
  );
}

export function CommandPaletteList(props: CommandPaletteListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const activeId = props.activeItems[props.activeIndex]?.id;
  const isActiveExpanded = Boolean(activeId && activeId === props.expandedTipId);
  useEffect(() => {
    const activeRow = listRef.current?.querySelector('[data-active="true"]');
    (isActiveExpanded ? activeRow?.closest('li') : activeRow)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId, isActiveExpanded]);

  if (!props.activeItems.length && !props.displaySections.some((section) => section.items.length)) {
    return (
      <ul className={floatingResultListClassName}>
        <li className={appFloatingEmptyStateClassName()}>{props.emptyLabel}</li>
      </ul>
    );
  }

  let enabledIndex = -1;
  return (
    <ul className={floatingResultListClassName} ref={listRef}>
      {props.displaySections.flatMap((section) => [
        <li className="px-3 pb-1 pt-2 text-xs font-semibold text-[color:var(--role-floating-text-muted)] first:pt-1" key={section.id}>
          {section.title}
        </li>,
        ...section.items.map((item) => {
          if (item.enabled) enabledIndex += 1;
          return (
            <li key={item.id}>
              <CommandPaletteRow
                active={item.enabled && enabledIndex === props.activeIndex}
                expanded={props.expandedTipId === item.id}
                item={item}
                onConfigureItem={props.onConfigureItem}
                onRunItem={props.onRunItem}
              />
              {item.tip && props.expandedTipId === item.id ? (
                <div className="space-y-1 px-3 pb-3 text-sm text-[color:var(--role-floating-text-primary)]">
                  <p>{item.tip.body}</p>
                  {item.tip.detail ? <p className="text-[color:var(--role-floating-text-muted)]">{item.tip.detail}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })
      ])}
    </ul>
  );
}
