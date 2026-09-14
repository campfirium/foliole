import { appFocusSilentClassName } from './InputFocus';

import { cn } from '@/shared/lib/utils';

const floatingSurfaceBaseClassName = [
  'border border-[var(--app-floating-border-color)] bg-[var(--app-floating-surface-bg)]',
  appFocusSilentClassName
].join(' ');
const floatingOverlayBaseClassName =
  'fixed inset-0 z-floating flex items-start justify-center bg-[var(--app-floating-overlay-bg)] px-4 pt-[12vh]';
const floatingInputBaseClassName = [
  'w-full appearance-none border-x-0 border-t-0 border-b border-transparent bg-[var(--app-floating-input-bg)] px-4 py-3 text-ui-md text-foreground shadow-none outline-none [box-shadow:none]',
  appFocusSilentClassName,
  'focus:border-transparent focus:shadow-none focus:[box-shadow:none]',
  'focus-visible:border-transparent focus-visible:shadow-none focus-visible:[box-shadow:none]',
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
const floatingWorkspaceBaseClassName =
  'grid h-floating-workspace max-h-floating-workspace w-floating-workspace max-w-floating-workspace grid-cols-floating-workspace overflow-hidden p-0';
const floatingWorkspaceSidebarBaseClassName =
  'flex min-h-0 flex-col border-r border-[var(--app-floating-divider-color)] bg-[var(--app-floating-surface-bg)]';
const floatingWorkspaceHeaderBaseClassName = 'flex shrink-0 flex-col gap-3 p-settings-panel-x';
const floatingWorkspaceTitleBaseClassName = 'text-ui-md font-normal text-foreground';
const floatingWorkspaceFormBaseClassName = 'flex items-center gap-2';
const floatingWorkspaceInputBaseClassName = [
  'h-9 min-w-0 flex-1 appearance-none rounded-md border border-[var(--app-floating-border-color)]',
  'bg-[var(--app-floating-input-bg)] px-3 text-ui-md text-foreground outline-none transition-colors',
  'placeholder:text-foreground/42 hover:bg-[var(--app-floating-item-hover-bg)]',
  'focus-visible:border-border-strong focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-45'
].join(' ');
const floatingWorkspaceListBaseClassName =
  'app-scrollbar min-h-0 flex-1 overflow-y-auto border-t border-[var(--app-floating-divider-color)] px-2 py-2 [--app-scrollbar-thumb-color:var(--app-floating-scrollbar-thumb-color)]';
const floatingWorkspacePreviewBaseClassName = 'min-h-0 bg-canvas';
const floatingWorkspaceItemBaseClassName = 'grid gap-1.5';
const floatingWorkspaceItemHeadingBaseClassName = 'flex min-w-0 items-center gap-2';
const floatingWorkspaceItemTitleBaseClassName = 'min-w-0 flex-1 truncate text-ui-md font-semibold text-foreground';
const floatingWorkspaceItemContextBaseClassName = 'block truncate text-ui-xs text-foreground/52';
const floatingWorkspaceItemSummaryBaseClassName = 'line-clamp-2 block text-ui-base text-foreground/65';
const floatingWorkspaceItemMetaBaseClassName = 'block truncate font-mono text-ui-xs text-foreground/45';
const floatingWorkspaceStateBaseClassName = 'px-3 py-5 text-left text-ui-md text-foreground/60';

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

export function appFloatingWorkspaceClassName(className?: string) {
  return cn(floatingWorkspaceBaseClassName, className);
}

export function appFloatingWorkspaceSidebarClassName(className?: string) {
  return cn(floatingWorkspaceSidebarBaseClassName, className);
}

export function appFloatingWorkspaceHeaderClassName(className?: string) {
  return cn(floatingWorkspaceHeaderBaseClassName, className);
}

export function appFloatingWorkspaceTitleClassName(className?: string) {
  return cn(floatingWorkspaceTitleBaseClassName, className);
}

export function appFloatingWorkspaceFormClassName(className?: string) {
  return cn(floatingWorkspaceFormBaseClassName, className);
}

export function appFloatingWorkspaceInputClassName(className?: string) {
  return cn(floatingWorkspaceInputBaseClassName, className);
}

export function appFloatingWorkspaceListClassName(className?: string) {
  return cn(floatingWorkspaceListBaseClassName, className);
}

export function appFloatingWorkspacePreviewClassName(className?: string) {
  return cn(floatingWorkspacePreviewBaseClassName, className);
}

export function appFloatingWorkspaceItemTitleClassName(className?: string) {
  return cn(floatingWorkspaceItemTitleBaseClassName, className);
}

export function appFloatingWorkspaceItemClassName(className?: string) {
  return appFloatingItemClassName(cn(floatingWorkspaceItemBaseClassName, className));
}

export function appFloatingWorkspaceItemHeadingClassName(className?: string) {
  return cn(floatingWorkspaceItemHeadingBaseClassName, className);
}

export function appFloatingWorkspaceItemContextClassName(className?: string) {
  return cn(floatingWorkspaceItemContextBaseClassName, className);
}

export function appFloatingWorkspaceItemSummaryClassName(className?: string) {
  return cn(floatingWorkspaceItemSummaryBaseClassName, className);
}

export function appFloatingWorkspaceItemMetaClassName(className?: string) {
  return cn(floatingWorkspaceItemMetaBaseClassName, className);
}

export function appFloatingWorkspaceStateClassName(className?: string) {
  return cn(floatingWorkspaceStateBaseClassName, className);
}
