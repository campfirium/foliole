import { ArrowUpDown, Check } from 'lucide-react';

import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
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
        <AppTooltipContent>{tooltipLabel}</AppTooltipContent>
        <AppDropdownMenuContent align="end" className="min-w-[220px] p-1" sideOffset={8}>
          <AppDropdownMenuLabel className="px-3 pb-1 pt-2 text-xs font-medium text-foreground/45">
            Sort by
          </AppDropdownMenuLabel>
          {props.options.map((option) => (
            <AppDropdownMenuItem
              className="justify-between rounded-md px-3 font-medium"
              key={option.key}
              onSelect={() => props.onChangeSortKey(option.key)}
            >
              <span>{option.label}</span>
              <Check aria-hidden="true" className={activeKey === option.key ? 'text-foreground' : 'invisible'} size={16} strokeWidth={1.9} />
            </AppDropdownMenuItem>
          ))}
          <AppDropdownMenuSeparator className="my-1 h-px bg-border/10" />
          <AppDropdownMenuLabel className="px-3 pb-1 pt-2 text-xs font-medium text-foreground/45">
            Order
          </AppDropdownMenuLabel>
          {orderOptions.map((option) => (
            <AppDropdownMenuItem
              className="justify-between rounded-md px-3 font-medium"
              key={option.value}
              onSelect={() => props.onChangeSortDirection(option.value)}
            >
              <span>{option.label}</span>
              <Check aria-hidden="true" className={props.sortDirection === option.value ? 'text-foreground' : 'invisible'} size={16} strokeWidth={1.9} />
            </AppDropdownMenuItem>
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
          <ArrowUpDown aria-hidden="true" size={16} strokeWidth={1.9} />
        </button>
      </AppDropdownMenuTrigger>
    </AppTooltipTrigger>
  );
}
