import { cn } from '../../../shared/lib/utils';

export function resolveNodeRowButtonClassName(args: {
  isDerived: boolean;
  isMuted: boolean;
  isSelected: boolean;
}) {
  return cn(
    'gap-0 pl-[calc(0.5rem+var(--node-depth,0)*1rem)] pr-4',
    'text-[#111317]',
    !args.isDerived && 'font-bold',
    args.isDerived && 'font-normal',
    args.isSelected && 'bg-foreground/[0.05]'
  );
}

export function resolveNodeVisibilityValue(isMuted: boolean) {
  return isMuted ? 'muted' : 'normal';
}
