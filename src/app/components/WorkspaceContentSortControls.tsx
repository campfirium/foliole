import { ArrowDownNarrowWide } from 'lucide-react';

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

export interface WorkspaceContentSortOption {
  key: WorkspaceContentSortKey;
  label: string;
}

function getOrderOptions(sortKey: WorkspaceContentSortKey): { label: string; value: WorkspaceContentSortDirection }[] {
  if (sortKey === 'name') {
    return [
      { label: 'A -> Z', value: 'asc' },
      { label: 'Z -> A', value: 'desc' }
    ];
  }
  if (sortKey === 'lastOpenedAt') {
    return [{ label: 'Newest first', value: 'desc' }];
  }
  if (sortKey === 'manual') {
    return [{ label: 'Manual order', value: 'asc' }];
  }
  return [
    { label: 'Newest first', value: 'desc' },
    { label: 'Oldest first', value: 'asc' }
  ];
}

export function WorkspaceContentSortControls(props: {
  onChangeSortDirection: (sortDirection: WorkspaceContentSortDirection) => void;
  onChangeSortKey: (sortKey: WorkspaceContentSortKey) => void;
  options: WorkspaceContentSortOption[];
  sortDirection: WorkspaceContentSortDirection;
  sortKey: WorkspaceContentSortKey;
}) {
  const activeOption = props.options.find((option) => option.key === props.sortKey) ?? props.options[0];
  const activeLabel = activeOption?.label ?? 'Date imported';
  const activeKey = activeOption?.key ?? 'importedAt';
  const orderOptions = getOrderOptions(activeKey);
  const activeOrderLabel = orderOptions.find((option) => option.value === props.sortDirection)?.label ?? orderOptions[0]?.label;
  const triggerLabel = `Sort list by ${activeLabel}`;
  const tooltipLabel = activeOrderLabel ? `${triggerLabel}: ${activeOrderLabel}` : triggerLabel;

  return (
    <AppTooltip>
      <AppDropdownMenu>
        <WorkspaceContentSortTrigger triggerLabel={triggerLabel} />
        <AppTooltipContent avoidCollisions={false} side="top">{tooltipLabel}</AppTooltipContent>
        <AppDropdownMenuContent align="end" className="min-w-[220px]" sideOffset={8}>
          <AppDropdownMenuLabel>Sort by</AppDropdownMenuLabel>
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
          <AppDropdownMenuLabel>Order</AppDropdownMenuLabel>
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
