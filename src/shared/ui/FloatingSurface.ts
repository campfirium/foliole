import { cn } from '@/shared/lib/utils';

const floatingSurfaceBaseClassName = 'border border-border bg-bg-elevated';

export function appFloatingSurfaceClassName(
  elevation: 'panel' | 'popover' = 'popover',
  className?: string
) {
  const elevationClassName = elevation === 'panel' ? 'rounded-lg shadow-panel' : 'rounded-lg shadow-popover';
  return cn(floatingSurfaceBaseClassName, elevationClassName, className);
}
