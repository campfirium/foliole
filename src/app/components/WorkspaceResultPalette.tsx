import './WorkspaceResultPalette.css';

import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { appFloatingOverlayClassName, appFloatingSurfaceClassName } from '../../shared/ui';

export const workspaceResultOverlayClassName = appFloatingOverlayClassName('items-center pt-0');
export const workspaceResultPanelClassName = appFloatingSurfaceClassName(
  'panel',
  'workspace-result-panel flex flex-col overflow-hidden !bg-canvas'
);
export const workspaceResultInputClassName = 'min-w-0 flex-1 bg-transparent px-0 text-base';

export function WorkspaceResultHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-14 shrink-0 items-center gap-2.5 border-b border-[var(--app-floating-divider-color)] bg-[var(--app-floating-surface-bg)] px-6">
      <Search aria-hidden="true" className="size-4 shrink-0 text-foreground/60" />
      {children}
    </div>
  );
}
