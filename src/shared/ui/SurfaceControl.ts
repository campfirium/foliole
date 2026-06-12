import { cn } from '@/shared/lib/utils';

const surfaceControlBaseClassName =
  'h-9 rounded-md border border-[var(--app-control-border-color)] bg-[var(--app-surface-control-bg)] px-3 text-ui-md text-foreground transition-colors hover:border-[var(--app-control-border-hover-color)] hover:bg-[var(--app-surface-control-hover-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45';

export function appSurfaceControlClassName(className?: string) {
  return cn(surfaceControlBaseClassName, className);
}
