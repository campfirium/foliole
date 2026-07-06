import { useEffect } from 'react';

import { appShelllessSurfaceClassName } from '../../shared/ui';
import { clearAppRuntimeNotice, useAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

function useAutoClearAppRuntimeNotice(notice: ReturnType<typeof useAppRuntimeNotice>) {
  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timeout = window.setTimeout(() => clearAppRuntimeNotice(notice.id), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);
}

export function WorkspaceRuntimeNotice() {
  const notice = useAppRuntimeNotice();
  useAutoClearAppRuntimeNotice(notice);

  if (!notice) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-0 left-[calc(var(--workspace-rail-width)+var(--workspace-list-current-width,300px)+var(--workspace-list-splitter-width,1px))] right-[calc(var(--workspace-right-sidebar-current-width,320px)+var(--workspace-right-sidebar-splitter-width,1px))] top-[var(--workspace-top-toolbar-height)] z-workspace-overlay flex items-center justify-center px-6"
      data-testid="app-runtime-notice"
      key={notice.id}
      role="status"
    >
      <div className={appShelllessSurfaceClassName('flex min-h-32 w-[min(540px,100%)] items-center justify-center px-8 py-6 text-center text-ui-md font-medium leading-6 text-shellless-title')}>
        {notice.message}
      </div>
    </div>
  );
}
