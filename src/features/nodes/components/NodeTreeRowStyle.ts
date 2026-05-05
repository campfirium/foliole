import { cn } from '../../../shared/lib/utils';

export function resolveNodeRowButtonClassName(args: {
  isDerived: boolean;
  isSelected: boolean;
}) {
  return cn(
    'gap-0 pl-[calc(0.5rem+var(--node-depth,0)*1rem)] pr-3',
    'text-[#111317]',
    !args.isDerived && 'font-bold',
    args.isDerived && 'font-normal',
    args.isSelected && 'bg-foreground/[0.05]'
  );
}

export function resolveNodeRowContentClassName() {
  return 'node-tree-row-content inline-flex min-w-0 items-center gap-1.5';
}

export function resolveNodeTreeClassName() {
  return 'flex flex-1 flex-col';
}

export function resolveNodeVisibilityValue(isMuted: boolean) {
  return isMuted ? 'muted' : 'normal';
}
