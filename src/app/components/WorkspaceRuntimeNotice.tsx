import { useEffect } from 'react';

import { appFloatingSurfaceClassName } from '../../shared/ui';
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
      className={appFloatingSurfaceClassName('panel', 'pointer-events-none absolute left-1/2 top-1/2 z-workspace-overlay flex min-h-32 w-[min(540px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 items-center justify-center px-8 py-6 text-center text-ui-md leading-6 text-foreground/72')}
      data-testid="app-runtime-notice"
      key={notice.id}
      role="status"
    >
      {notice.message}
    </div>
  );
}
