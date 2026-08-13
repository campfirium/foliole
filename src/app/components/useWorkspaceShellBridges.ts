import { useUndoRouterSurfaceTracking } from '../hooks/undoRouter';

import { useDesktopResizeRemeasureBridge } from './useDesktopResizeRemeasureBridge';

export function useWorkspaceShellBridges() {
  useDesktopResizeRemeasureBridge();
  useUndoRouterSurfaceTracking();
}
