import { cn } from '../../../shared/lib/utils';

export function resolveNodeRowButtonClassName(args: {
  depth: number;
  isBulkSelectionActive: boolean;
  isDerived: boolean;
  isSelected: boolean;
}) {
  return cn(
    'gap-0 overflow-hidden pl-[calc(0.4rem+var(--node-depth,0)*1rem)] pr-[0.4rem]',
    'text-foreground',
    'font-normal',
    args.isSelected && 'bg-foreground/[0.05]',
    args.isSelected && args.isBulkSelectionActive && 'my-0.5'
  );
}

export function resolveNodeRowContentClassName() {
  return 'node-tree-row-content flex min-w-0 w-full flex-1 flex-col items-start gap-0.5 overflow-hidden';
}

export function resolveNodeTreeClassName() {
  return 'flex flex-1 flex-col';
}

export function resolveNodeVisibilityValue(isMuted: boolean) {
  return isMuted ? 'muted' : 'normal';
}
