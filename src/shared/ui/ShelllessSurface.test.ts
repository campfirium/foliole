import { expect, it } from 'vitest';

import {
  appShelllessActionBarClassName,
  appShelllessControlClassName,
  appShelllessInputClassName,
  appShelllessMetaClassName,
  appShelllessSurfaceClassName
} from './ShelllessSurface';

it('keeps shell-less surfaces on semantic shell-less tokens', () => {
  expect(appShelllessSurfaceClassName()).toContain('bg-shellless-surface');
  expect(appShelllessSurfaceClassName()).toContain('border-shellless-border');
  expect(appShelllessSurfaceClassName()).toContain('rounded-shellless');
  expect(appShelllessSurfaceClassName()).toContain('shadow-shellless');
  expect(appShelllessSurfaceClassName()).not.toContain('bg-background');
  expect(appShelllessSurfaceClassName()).not.toContain('workspace-region-main-rail-bg');
});

it('anchors shell-less colors to the floating menu family', () => {
  expect(appShelllessSurfaceClassName()).toContain('bg-shellless-surface');
  expect(appShelllessActionBarClassName()).toContain('border-shellless-divider');
});

it('keeps shell-less input and metadata typography separated', () => {
  expect(appShelllessInputClassName()).toContain('font-shellless-input');
  expect(appShelllessInputClassName()).toContain('pt-[var(--app-shellless-input-padding-block-start)]');
  expect(appShelllessInputClassName()).toContain('pb-[var(--app-shellless-input-padding-block-end)]');
  expect(appShelllessInputClassName()).toContain('text-[length:var(--app-shellless-input-font-size)]');
  expect(appShelllessInputClassName()).toContain('leading-[var(--app-shellless-input-line-height)]');
  expect(appShelllessInputClassName()).toContain('placeholder:text-shellless-placeholder');
  expect(appShelllessMetaClassName()).toContain('font-shellless-ui');
  expect(appShelllessMetaClassName()).toContain('text-shellless-muted');
});

it('keeps shell-less actions line-only and low contrast', () => {
  expect(appShelllessActionBarClassName()).toContain('border-t');
  expect(appShelllessActionBarClassName()).toContain('border-shellless-divider');
  expect(appShelllessActionBarClassName()).toContain('bg-transparent');
  expect(appShelllessActionBarClassName()).toContain('py-2');
  expect(appShelllessControlClassName()).toContain('border-shellless-control-border');
  expect(appShelllessControlClassName()).toContain('rounded-shellless-control');
  expect(appShelllessControlClassName()).toContain('text-shellless-control-fg');
  expect(appShelllessControlClassName()).toContain('min-h-8');
  expect(appShelllessControlClassName()).toContain('hover:text-shellless-fg');
  expect(appShelllessControlClassName()).toContain('disabled:text-shellless-faint');
});
