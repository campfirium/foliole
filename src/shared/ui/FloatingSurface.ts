import { cn } from '@/shared/lib/utils';

const floatingSurfaceBaseClassName =
  'border border-[var(--app-floating-border-color)] bg-[var(--app-floating-surface-bg)]';
const floatingOverlayBaseClassName =
  'fixed inset-0 z-floating flex items-start justify-center bg-[var(--app-floating-overlay-bg)] px-4 pt-[12vh]';
const floatingInputBaseClassName = [
  'w-full appearance-none border-x-0 border-t-0 border-b border-[var(--app-floating-divider-color)] bg-[var(--app-floating-input-bg)] px-4 py-3 text-ui-md text-foreground shadow-none outline-none [box-shadow:none]',
  'focus:border-[var(--app-floating-divider-color)] focus:outline-none focus:ring-0 focus:shadow-none focus:[box-shadow:none] focus:[outline:0]',
  'focus-visible:border-[var(--app-floating-divider-color)] focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:[box-shadow:none] focus-visible:[outline:0]',
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
  'px-3 pb-1 pt-3 text-ui-xs font-semibold uppercase tracking-[0.08em] text-foreground/50';
const floatingEmptyStateBaseClassName = 'px-3 py-8 text-center text-ui-md text-foreground/60';
const floatingStateSurfaceBaseClassName = [
  'rounded-md border border-[var(--app-floating-border-color)] bg-[var(--app-floating-surface-bg)] shadow-control',
  'px-3 py-8 text-center text-ui-md text-foreground/60'
].join(' ');
const floatingMetaBadgeBaseClassName = [
  'truncate rounded-full border border-[var(--app-floating-border-color)] bg-[var(--app-floating-muted-bg)]',
  'px-2 py-0.5 text-ui-xs font-medium text-foreground/65'
].join(' ');
const floatingToolbarBaseClassName = [
  'pointer-events-auto absolute left-1/2 top-3 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-4',
  'rounded-full px-4 py-2 transition-[opacity,transform] duration-200 ease-out'
].join(' ');

export function appFloatingSurfaceClassName(
  elevation: 'panel' | 'popover' = 'popover',
  className?: string
) {
  const elevationClassName =
    elevation === 'panel' ? 'rounded-lg shadow-panel' : 'rounded-lg shadow-popover';
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

export function appFloatingStateSurfaceClassName(className?: string) {
  return cn(floatingStateSurfaceBaseClassName, className);
}

export function appFloatingMetaBadgeClassName(className?: string) {
  return cn(floatingMetaBadgeBaseClassName, className);
}

export function appFloatingToolbarClassName(className?: string) {
  return cn(appFloatingSurfaceClassName('popover'), floatingToolbarBaseClassName, className);
}
