import { useEffect, useRef, useState, type FocusEvent } from 'react';

import { AppButton, appShelllessSurfaceClassName } from '../../shared/ui';
import { clearAppRuntimeNotice, useAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

const DEFAULT_ACTION_DURATION_MS = 8000;
const DEFAULT_NOTICE_DURATION_MS = 4200;

function useAutoClearAppRuntimeNotice(id: number, durationMs: number, paused: boolean) {
  const remainingMs = useRef(durationMs);
  useEffect(() => {
    if (paused) return undefined;
    const startedAt = Date.now();
    const timeout = window.setTimeout(() => clearAppRuntimeNotice(id), remainingMs.current);
    return () => {
      remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - startedAt));
      window.clearTimeout(timeout);
    };
  }, [id, paused]);
}

function handleNoticeBlur(event: FocusEvent<HTMLDivElement>, setFocused: (focused: boolean) => void) {
  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
}

function RuntimeNoticeSurface({ notice }: { notice: NonNullable<ReturnType<typeof useAppRuntimeNotice>> }) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const paused = focused || hovered;
  const durationMs = notice.durationMs ?? (notice.action ? DEFAULT_ACTION_DURATION_MS : DEFAULT_NOTICE_DURATION_MS);
  const isTrashRowAction = notice.presentation === 'trash-row';
  useAutoClearAppRuntimeNotice(notice.id, durationMs, isTrashRowAction ? false : paused);

  if (isTrashRowAction) {
    return <span aria-live="polite" className="sr-only" role="status">{notice.message}</span>;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-0 left-[calc(var(--workspace-rail-width)+var(--workspace-list-current-width,300px)+var(--workspace-list-splitter-width,1px))] right-[calc(var(--workspace-right-sidebar-current-width,320px)+var(--workspace-right-sidebar-splitter-width,1px))] top-[var(--workspace-top-toolbar-height)] z-workspace-overlay flex items-center justify-center px-6"
      data-notice-placement="workspace-center"
      data-testid="app-runtime-notice"
      role="status"
    >
      <div
        className={appShelllessSurfaceClassName(`flex min-h-[52px] items-center gap-3 px-4 py-3 text-left text-ui-md font-medium leading-5 text-shellless-title ${notice.action ? 'pointer-events-auto w-[min(360px,100%)] justify-center' : 'w-[min(300px,100%)] justify-center text-center'}`)}
        onBlurCapture={(event) => handleNoticeBlur(event, setFocused)}
        onFocusCapture={() => setFocused(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
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

export function WorkspaceRuntimeNotice() {
  const notice = useAppRuntimeNotice();
  return notice ? <RuntimeNoticeSurface key={notice.id} notice={notice} /> : null;
}
