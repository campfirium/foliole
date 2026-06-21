import { cn } from '@/shared/lib/utils';

const shelllessSurfaceBaseClassName = [
  'border border-shellless-border bg-shellless-surface text-shellless-fg shadow-shellless',
  'rounded-shellless font-shellless-ui'
].join(' ');

const shelllessInputBaseClassName = [
  'app-shellless-input box-border w-full resize-none appearance-none border-0 bg-shellless-input pb-[var(--app-shellless-input-padding-block-end)] pt-[var(--app-shellless-input-padding-block-start)] font-shellless-input text-[length:var(--app-shellless-input-font-size)] leading-[var(--app-shellless-input-line-height)] text-shellless-fg shadow-none [box-shadow:none]',
  'outline-none placeholder:text-shellless-placeholder focus:outline-none focus:ring-0 focus:shadow-none focus:[box-shadow:none] focus:[outline:0] focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:[box-shadow:none] focus-visible:[outline:0]',
  '[scrollbar-color:var(--app-shellless-muted-fg)_transparent] [scrollbar-width:thin]'
].join(' ');

const shelllessMetaBaseClassName = 'font-shellless-ui text-shellless-meta text-shellless-muted';
const shelllessActionBarBaseClassName =
  'flex items-center justify-end gap-2 border-t border-shellless-divider bg-transparent px-6 py-2 font-shellless-ui';
const shelllessControlBaseClassName = [
  'inline-flex min-h-8 items-center justify-center rounded-shellless-control border border-shellless-control-border bg-transparent px-3.5 text-shellless-ui text-shellless-control-fg',
  'transition-colors hover:border-shellless-control-border-hover hover:bg-shellless-control-hover hover:text-shellless-fg',
  'disabled:pointer-events-none disabled:text-shellless-faint'
].join(' ');

export function appShelllessSurfaceClassName(className?: string) {
  return cn(shelllessSurfaceBaseClassName, className);
}

export function appShelllessInputClassName(className?: string) {
  return cn(shelllessInputBaseClassName, className);
}

export function appShelllessMetaClassName(className?: string) {
  return cn(shelllessMetaBaseClassName, className);
}

export function appShelllessActionBarClassName(className?: string) {
  return cn(shelllessActionBarBaseClassName, className);
}

export function appShelllessControlClassName(className?: string) {
  return cn(shelllessControlBaseClassName, className);
}
