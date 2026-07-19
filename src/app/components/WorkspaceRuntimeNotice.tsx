import { useEffect } from 'react';

import { AppButton, appShelllessSurfaceClassName } from '../../shared/ui';
import { clearAppRuntimeNotice, useAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

function useAutoClearAppRuntimeNotice(notice: ReturnType<typeof useAppRuntimeNotice>) {
  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timeout = window.setTimeout(() => clearAppRuntimeNotice(notice.id), notice.action ? 8000 : 4200);
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
      <div className={appShelllessSurfaceClassName(`flex min-h-[52px] items-center justify-center gap-3 px-[18px] py-[14px] text-center text-ui-md font-medium leading-5 text-shellless-title ${notice.action ? 'pointer-events-auto w-[min(360px,100%)]' : 'w-[min(300px,100%)]'}`)}>
        <span>{notice.message}</span>
        {notice.action ? (
          <AppButton
            onClick={() => {
              clearAppRuntimeNotice(notice.id);
              notice.action?.onSelect();
            }}
            variant="subtle"
          >
            {notice.action.label}
          </AppButton>
        ) : null}
      </div>
    </div>
  );
}
