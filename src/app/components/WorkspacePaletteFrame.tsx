import './WorkspaceFloatingPlacement.css';

import type { ComponentPropsWithRef } from 'react';

import { appFloatingOverlayClassName, appFloatingSurfaceClassName } from '../../shared/ui';

export const workspacePaletteOverlayClassName = appFloatingOverlayClassName('pt-0');

export function WorkspacePaletteFrame(props: ComponentPropsWithRef<'div'>) {
  return (
    <div className="workspace-floating-placement workspace-palette-placement pointer-events-none">
      <div {...props} className={appFloatingSurfaceClassName('panel', 'flex flex-col overflow-hidden !bg-canvas')} />
    </div>
  );
}
