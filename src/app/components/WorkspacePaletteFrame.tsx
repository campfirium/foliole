import './WorkspaceFloatingPlacement.css';

import type { ComponentPropsWithRef } from 'react';

import { appFloatingOverlayClassName, appFloatingSurfaceClassName } from '../../shared/ui';

export const workspacePaletteOverlayClassName = appFloatingOverlayClassName('pt-0');

export function WorkspacePaletteFrame({
  variant,
  ...props
}: ComponentPropsWithRef<'div'> & { variant: 'command' | 'results' }) {
  const surface = appFloatingSurfaceClassName(
    'panel',
    variant === 'results' ? 'flex flex-col overflow-hidden !bg-canvas' : 'flex flex-col overflow-hidden'
  );

  return (
    <div
      className="workspace-floating-placement workspace-palette-placement pointer-events-none"
      data-variant={variant}
    >
      <div {...props} className={surface} />
    </div>
  );
}
