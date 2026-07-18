import { ArrowDownNarrowWide } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger
} from '../../shared/ui';

import type { WorkspaceContentSortDirection, WorkspaceContentSortKey } from './workspaceContentSort';

type Translate = ReturnType<typeof useTranslation>;

export interface WorkspaceContentSortOption {
  key: WorkspaceContentSortKey;
  label: string;
}

function getOrderOptions(sortKey: WorkspaceContentSortKey, t: Translate): { label: string; value: WorkspaceContentSortDirection }[] {
  if (sortKey === 'name') {
    return [
      { label: t('desktop.sort.order.az'), value: 'asc' },
      { label: t('desktop.sort.order.za'), value: 'desc' }
    ];
  }
  if (sortKey === 'lastOpenedAt') {
    return [{ label: t('desktop.sort.order.newest'), value: 'desc' }];
  }
  if (sortKey === 'manual') {
    return [{ label: t('desktop.sort.order.manual'), value: 'asc' }];
  }
  return [
    { label: t('desktop.sort.order.newest'), value: 'desc' },
    { label: t('desktop.sort.order.oldest'), value: 'asc' }
  ];
}

export function WorkspaceContentSortControls(props: {
  onChangeSortDirection: (sortDirection: WorkspaceContentSortDirection) => void;
  onChangeSortKey: (sortKey: WorkspaceContentSortKey) => void;
  options: WorkspaceContentSortOption[];
  sortDirection: WorkspaceContentSortDirection;
  sortKey: WorkspaceContentSortKey;
}) {
  const t = useTranslation();
  const activeOption = props.options.find((option) => option.key === props.sortKey) ?? props.options[0];
  const activeLabel = activeOption?.label ?? t('desktop.sort.fallback.dateImported');
  const activeKey = activeOption?.key ?? 'importedAt';
  const orderOptions = getOrderOptions(activeKey, t);
  const activeOrderLabel = orderOptions.find((option) => option.value === props.sortDirection)?.label ?? orderOptions[0]?.label;
  const triggerLabel = t('desktop.sort.listBy', { label: activeLabel });
  const tooltipLabel = activeOrderLabel ? `${triggerLabel}: ${activeOrderLabel}` : triggerLabel;

  return (
    <AppTooltip>
      <AppDropdownMenu>
        <WorkspaceContentSortTrigger triggerLabel={triggerLabel} />
        <AppTooltipContent avoidCollisions={false} side="top">{tooltipLabel}</AppTooltipContent>
        <AppDropdownMenuContent align="end" className="min-w-[220px]" sideOffset={8}>
          <AppDropdownMenuLabel>{t('desktop.sort.sortBy')}</AppDropdownMenuLabel>
          {props.options.map((option) => (
            <AppDropdownMenuCheckItem
              checked={activeKey === option.key}
              key={option.key}
              onSelect={() => props.onChangeSortKey(option.key)}
            >
              {option.label}
            </AppDropdownMenuCheckItem>
          ))}
          <AppDropdownMenuSeparator />
          <AppDropdownMenuLabel>{t('desktop.sort.order')}</AppDropdownMenuLabel>
          {orderOptions.map((option) => (
            <AppDropdownMenuCheckItem
              checked={props.sortDirection === option.value}
              key={option.value}
              onSelect={() => props.onChangeSortDirection(option.value)}
            >
              {option.label}
            </AppDropdownMenuCheckItem>
          ))}
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </AppTooltip>
  );
}

function WorkspaceContentSortTrigger(props: { triggerLabel: string }) {
  return (
    <AppTooltipTrigger asChild>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={props.triggerLabel}
          className="inline-flex size-8 items-center justify-center rounded-md bg-transparent text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
          type="button"
        >
          <ArrowDownNarrowWide aria-hidden="true" size={16} strokeWidth={1.9} />
        </button>
      </AppDropdownMenuTrigger>
    </AppTooltipTrigger>
  );
}
