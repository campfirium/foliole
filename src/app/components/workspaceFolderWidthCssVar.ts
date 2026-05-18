import { useEffect } from 'react';

export function useWorkspaceFolderWidthCssVar(width: number) {
  useEffect(() => {
    document.documentElement.style.setProperty('--workspace-folder-column-width', `${width}px`);
  }, [width]);
}
