import './WorkspaceFloatingPlacement.css';

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
      className="workspace-floating-placement workspace-notice-placement pointer-events-none z-workspace-overlay flex justify-center"
      data-action={notice.action ? '' : undefined}
      data-testid="app-runtime-notice"
      role="status"
    >
      <div
        className={appShelllessSurfaceClassName(`flex min-h-[52px] max-w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-ui-md font-medium leading-5 text-shellless-title ${notice.action ? 'pointer-events-auto justify-center' : 'justify-center text-center'}`)}
        onBlurCapture={(event) => handleNoticeBlur(event, setFocused)}
        onFocusCapture={() => setFocused(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">{notice.message}</span>
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
