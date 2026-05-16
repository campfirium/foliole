import { cn } from '@/shared/lib/utils';

const floatingSurfaceBaseClassName =
  'border border-[var(--app-floating-border-color)] bg-[var(--app-floating-surface-bg)]';
const floatingOverlayBaseClassName =
  'fixed inset-0 z-floating flex items-start justify-center bg-[var(--app-floating-overlay-bg)] px-4 pt-[12vh]';
const floatingInputBaseClassName = [
  'w-full border-x-0 border-t-0 border-b border-[var(--app-floating-divider-color)] bg-[var(--app-floating-input-bg)] px-4 py-3 text-sm text-foreground',
  'focus-visible:outline-none focus-visible:ring-0',
  'placeholder:text-foreground/42'
].join(' ');
const floatingListBaseClassName =
  'app-scrollbar max-h-[50vh] overflow-y-auto px-2 py-2 [--app-scrollbar-thumb-color:var(--app-floating-scrollbar-thumb-color)]';
const floatingItemBaseClassName = [
  'w-full rounded-md px-3 py-2 text-left transition-colors',
  'hover:bg-[var(--app-floating-item-hover-bg)]',
  'data-[active=true]:bg-[var(--app-floating-item-active-bg)]',
  'data-[disabled=true]:opacity-40'
].join(' ');
const floatingSectionHeaderBaseClassName =
  'px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/50';
const floatingEmptyStateBaseClassName = 'px-3 py-8 text-center text-sm text-foreground/60';
const floatingMetaBadgeBaseClassName = [
  'truncate rounded-full border border-[var(--app-floating-border-color)] bg-[var(--app-floating-muted-bg)]',
  'px-2 py-0.5 text-[10px] font-medium text-foreground/65'
].join(' ');

export function appFloatingSurfaceClassName(
  elevation: 'panel' | 'popover' = 'popover',
  className?: string
) {
  const elevationClassName =
    elevation === 'panel' ? 'rounded-lg shadow-panel' : 'rounded-lg shadow-none';
  return cn(floatingSurfaceBaseClassName, elevationClassName, className);
}

export function appFloatingOverlayClassName(className?: string) {
  return cn(floatingOverlayBaseClassName, className);
}

export function appFloatingInputClassName(className?: string) {
  return cn(floatingInputBaseClassName, className);
}

export function appFloatingListClassName(className?: string) {
  return cn(floatingListBaseClassName, className);
}

export function appFloatingItemClassName(className?: string) {
  return cn(floatingItemBaseClassName, className);
}

export function appFloatingSectionHeaderClassName(className?: string) {
  return cn(floatingSectionHeaderBaseClassName, className);
}

export function appFloatingEmptyStateClassName(className?: string) {
  return cn(floatingEmptyStateBaseClassName, className);
}

export function appFloatingMetaBadgeClassName(className?: string) {
  return cn(floatingMetaBadgeBaseClassName, className);
}
