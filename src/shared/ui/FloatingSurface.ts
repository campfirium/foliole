import { cn } from '@/shared/lib/utils';

const floatingSurfaceBaseClassName = 'border border-border bg-[var(--app-floating-surface-bg)]';

export function appFloatingSurfaceClassName(
  elevation: 'panel' | 'popover' = 'popover',
  className?: string
) {
  const elevationClassName = elevation === 'panel' ? 'rounded-lg shadow-panel' : 'rounded-lg shadow-none';
  return cn(floatingSurfaceBaseClassName, elevationClassName, className);
}
