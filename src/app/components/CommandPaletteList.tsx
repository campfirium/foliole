import { CirclePlus, Command, Lightbulb, Settings2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

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
  onConfigureItem: (item: CommandPaletteItem) => void;
  onRunItem: (item: PaletteResult | undefined) => void;
}

const typeIconClassName = 'mt-0.5 shrink-0 text-[color:var(--role-floating-text-muted)] opacity-65';

function CommandPaletteTip({ active, tip }: { active: boolean; tip: HelpKnowledgeItem }) {
  return (
    <div className={appFloatingItemClassName('flex items-start gap-2.5 px-3 py-2 text-sm')} data-active={active}>
      <Lightbulb aria-hidden="true" className={typeIconClassName} size={15} strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{tip.title}</p>
        <div className="mt-0.5 grid grid-cols-2 gap-x-4 text-xs text-[color:var(--role-floating-text-muted)]">
          <p className={tip.detail ? undefined : 'col-span-2'}>{tip.body}</p>
          {tip.detail ? <p>{tip.detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

function CommandPaletteRow(props: {
  active: boolean;
  item: PaletteResult;
  onConfigureItem: CommandPaletteListProps['onConfigureItem'];
  onRunItem: CommandPaletteListProps['onRunItem'];
}) {
  const t = useTranslation();
  const shortcutLabel = formatShortcutSetDisplayLabel(props.item.shortcuts);
  const { item } = props;
  const descriptionId = useId();
  if (item.tip) return <CommandPaletteTip active={props.active} tip={item.tip} />;

  const Icon = item.setting ? Settings2 : Command;
  return (
    <div
      className={appFloatingItemClassName('flex items-stretch p-0 text-sm')}
      data-active={props.active}
      data-disabled={!props.item.enabled}
    >
      <button
        aria-describedby={item.setting?.description ? descriptionId : undefined}
        aria-keyshortcuts={formatAriaKeyShortcuts(props.item.shortcuts)}
        aria-label={item.title}
        className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2 text-left"
        disabled={!props.item.enabled}
        onClick={() => props.onRunItem(props.item)}
        type="button"
      >
        <Icon aria-hidden="true" className={typeIconClassName} size={15} strokeWidth={1.5} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-[color:var(--role-floating-text-primary)]">{item.title}</span>
          {item.setting?.description ? (
            <span className="mt-0.5 block text-xs text-[color:var(--role-floating-text-muted)]" id={descriptionId}>{item.setting.description}</span>
          ) : null}
        </span>
      </button>
      {item.setting ? null : (
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
  useEffect(() => {
    const activeRow = listRef.current?.querySelector('[data-active="true"]');
    activeRow?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

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
