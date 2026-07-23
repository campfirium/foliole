import { CirclePlus } from 'lucide-react';

import type { buildCommandMenuSections } from '../../shared/commands/menuModel';
import { formatShortcutSetDisplayLabel } from '../../shared/commands/shortcutDisplay';
import { formatAriaKeyShortcuts } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName
} from '../../shared/ui';

interface CommandPaletteListProps {
  activeIndex: number;
  activeItems: CommandPaletteItem[];
  displaySections: ReturnType<typeof buildCommandMenuSections>;
  emptyLabel: string;
  onConfigureItem: (item: CommandPaletteItem) => void;
  onRunItem: (item: CommandPaletteItem | undefined) => void;
}

function CommandPaletteRow(props: {
  active: boolean;
  item: CommandPaletteItem;
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
        aria-keyshortcuts={formatAriaKeyShortcuts(props.item.shortcuts)}
        aria-label={props.item.title}
        className="min-w-0 flex-1 px-3 py-2 text-left"
        disabled={!props.item.enabled}
        onClick={() => props.onRunItem(props.item)}
        type="button"
      >
        <span className="block truncate font-medium text-foreground">{props.item.title}</span>
      </button>
      <button
        aria-label={t('desktop.palette.command.configureShortcut', { title: props.item.title })}
        className="flex shrink-0 items-center px-3 text-foreground/55 hover:text-foreground focus-visible:text-foreground"
        onClick={() => props.onConfigureItem(props.item)}
        type="button"
      >
        {shortcutLabel ? <span className="text-xs">{shortcutLabel}</span> : <CirclePlus aria-hidden="true" size={16} strokeWidth={1.8} />}
      </button>
    </div>
  );
}

export function CommandPaletteList(props: CommandPaletteListProps) {
  if (!props.activeItems.length && !props.displaySections.some((section) => section.items.length)) {
    return (
      <ul className={appFloatingListClassName()}>
        <li className={appFloatingEmptyStateClassName()}>{props.emptyLabel}</li>
      </ul>
    );
  }

  let enabledIndex = -1;
  return (
    <ul className={appFloatingListClassName()}>
      {props.displaySections.flatMap((section) => [
        <li className="px-3 pb-1 pt-2 text-xs font-semibold text-foreground/45 first:pt-1" key={section.id}>
          {section.title}
        </li>,
        ...section.items.map((item) => {
          if (item.enabled) enabledIndex += 1;
          return (
            <li key={item.id}>
              <CommandPaletteRow
                active={item.enabled && enabledIndex === props.activeIndex}
                item={item}
                onConfigureItem={props.onConfigureItem}
                onRunItem={props.onRunItem}
              />
            </li>
          );
        })
      ])}
    </ul>
  );
}
