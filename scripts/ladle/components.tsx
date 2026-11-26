import '../../src/app/styles.css';

import { ThemeState, type GlobalProvider } from '@ladle/react';
import { useLayoutEffect } from 'react';

import {
  applyWorkspaceSurfaceSettings,
  DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE,
  DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
  DEFAULT_WORKSPACE_SURFACE_PALETTE
} from '../../src/features/settings/model/workspaceSurfaceSettings';

export const Provider: GlobalProvider = ({ children, globalState }) => {
  const mode = globalState.theme === ThemeState.Dark ? 'dark' : 'light';

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.resolvedBaseColor = mode;
    applyWorkspaceSurfaceSettings(root, {
      assignments: DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
      palette: mode === 'dark' ? DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE : DEFAULT_WORKSPACE_SURFACE_PALETTE
    });
  }, [mode]);

  return <>{children}</>;
};
