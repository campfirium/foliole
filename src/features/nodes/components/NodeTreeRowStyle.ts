import { cn } from '../../../shared/lib/utils';

export function resolveNodeRowButtonClassName(args: {
  depth: number;
  isBulkSelectionActive: boolean;
  isDerived: boolean;
  isHighlighted: boolean;
  isSelected: boolean;
}) {
  return cn(
    'gap-0 overflow-hidden pl-[calc(0.4rem+var(--node-depth,0)*1rem)] pr-[0.4rem] leading-5',
    'text-foreground',
    'font-normal',
    args.isHighlighted &&
      "relative bg-transparent before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0.5 before:top-0.5 before:rounded-md before:bg-foreground/[0.035] before:content-['']",
    args.isSelected &&
      "relative bg-transparent before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0.5 before:top-0.5 before:rounded-md before:bg-foreground/[0.05] before:content-['']"
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
