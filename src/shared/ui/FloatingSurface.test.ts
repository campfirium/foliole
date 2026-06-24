import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import {
  appFloatingInputClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingMetaBadgeClassName,
  appFloatingOverlayClassName,
  appFloatingStateSurfaceClassName,
  appFloatingSurfaceClassName,
  appFloatingToolbarClassName
} from './FloatingSurface';

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

it('keeps command and search surfaces on shared floating tokens', () => {
  expect(appFloatingOverlayClassName()).toContain('bg-[var(--app-floating-overlay-bg)]');
  expect(appFloatingSurfaceClassName('panel')).toContain('bg-[var(--app-floating-surface-bg)]');
  expect(appFloatingSurfaceClassName('panel')).toContain('shadow-panel');
  expect(appFloatingSurfaceClassName('panel')).toContain('app-focus-silent');
  expect(appFloatingSurfaceClassName('panel')).toContain('focus:ring-0');
  expect(appFloatingSurfaceClassName('panel')).toContain('focus-visible:ring-0');
  expect(appFloatingSurfaceClassName('panel')).toContain('focus:[--tw-ring-shadow:0_0_#0000]');
  expect(appFloatingSurfaceClassName('panel')).toContain('focus-visible:[--tw-ring-shadow:0_0_#0000]');
  expect(appFloatingSurfaceClassName('popover')).toContain('shadow-popover');
  expect(appFloatingInputClassName()).toContain('bg-[var(--app-floating-input-bg)]');
  expect(appFloatingInputClassName()).toContain('appearance-none');
  expect(appFloatingInputClassName()).toContain('border-b');
  expect(appFloatingInputClassName()).toContain('border-transparent');
  expect(appFloatingInputClassName()).toContain('shadow-none');
  expect(appFloatingInputClassName()).toContain('[box-shadow:none]');
  expect(appFloatingInputClassName()).toContain('app-focus-silent');
  expect(appFloatingInputClassName()).toContain('focus:ring-0');
  expect(appFloatingInputClassName()).toContain('focus:shadow-none');
  expect(appFloatingInputClassName()).toContain('focus:[box-shadow:none]');
  expect(appFloatingInputClassName()).toContain('focus:border-transparent');
  expect(appFloatingInputClassName()).toContain('focus-visible:ring-0');
  expect(appFloatingInputClassName()).toContain('focus-visible:shadow-none');
  expect(appFloatingInputClassName()).toContain('focus-visible:[box-shadow:none]');
  expect(appFloatingInputClassName()).toContain('focus-visible:border-transparent');
  expect(appFloatingInputClassName()).not.toContain('--app-floating-divider-color');
  expect(appFloatingInputClassName()).not.toContain('focus-visible:ring-ring');
  expect(appFloatingListClassName()).toContain(
    '[--app-scrollbar-thumb-color:var(--app-floating-scrollbar-thumb-color)]'
  );
  expect(appFloatingItemClassName()).toContain('hover:bg-[var(--app-floating-item-hover-bg)]');
  expect(appFloatingItemClassName()).toContain(
    'data-[active=true]:bg-[var(--app-floating-item-active-bg)]'
  );
  expect(appFloatingMetaBadgeClassName()).toContain('text-ui-xs');
  expect(appFloatingMetaBadgeClassName()).not.toContain('text-[10px]');
  expect(appFloatingStateSurfaceClassName()).toContain('bg-[var(--app-floating-surface-bg)]');
  expect(appFloatingStateSurfaceClassName()).toContain('border-[var(--app-floating-border-color)]');
  expect(appFloatingStateSurfaceClassName()).toContain('shadow-control');
  expect(appFloatingStateSurfaceClassName()).toContain('text-ui-md');
  expect(appFloatingStateSurfaceClassName()).toContain('py-8');
  expect(appFloatingToolbarClassName()).toContain('bg-[var(--app-floating-surface-bg)]');
  expect(appFloatingToolbarClassName()).toContain('border-[var(--app-floating-border-color)]');
  expect(appFloatingToolbarClassName()).toContain('rounded-full');
  expect(appFloatingToolbarClassName()).not.toContain('bg-bg-elevated');
});

it('keeps formal floating menus from defining private surface colors', () => {
  const files = [
    'src/shared/ui/DropdownMenu.tsx',
    'src/features/nodes/components/NodeListContextMenu.tsx',
    'src/app/components/WorkspaceVirtualSavedSearchContextMenu.tsx',
    'src/features/nodes/components/nodeListContextMenuPresentation.tsx',
    'src/features/editor/adapters/liveMarkdownImageContextMenu.ts'
  ];
  const combined = files.map(readWorkspaceFile).join('\n');

  expect(combined).not.toContain('bg-[color-mix(in_oklab,var(--app-floating-surface-bg)');
  expect(combined).not.toContain('--node-context-menu-item-hover-bg');
  expect(combined).not.toContain('--app-selection-surface-color');
});

it('keeps focus policy in shared app focus tokens', () => {
  expect(readWorkspaceFile('src/app/styles.css')).toContain('@import "./tokens/focus.css";');

  const focusTokens = readWorkspaceFile('src/app/tokens/focus.css');
  expect(focusTokens).toContain('.app-focus-control:focus');
  expect(focusTokens).toContain('.app-focus-silent:focus');
  expect(focusTokens).toContain('--tw-ring-shadow: 0 0 #0000');
});
