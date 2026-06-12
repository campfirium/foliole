import { ArrowUpRight, CheckCircle2, XCircle } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName, AppSpinner } from '../../shared/ui';

export type WorkspaceActivityNoticeTone = 'loading' | 'success' | 'error';

const iconClassName = 'mt-0.5 shrink-0';
const staticIconClassName = `${iconClassName} size-4`;

function renderIcon(tone: WorkspaceActivityNoticeTone) {
  if (tone === 'loading') {
    return <AppSpinner className={iconClassName} decorative size="sm" />;
  }
  if (tone === 'success') {
    return <CheckCircle2 aria-hidden="true" className={staticIconClassName} strokeWidth={1.75} />;
  }
  return <XCircle aria-hidden="true" className={staticIconClassName} strokeWidth={1.75} />;
}

export function WorkspaceActivityNotice({
  message,
  onOpen,
  openLabel,
  tone
}: {
  message: string;
  onOpen?: () => void;
  openLabel?: string;
  tone: WorkspaceActivityNoticeTone;
}) {
  const t = useTranslation();
  const resolvedOpenLabel = openLabel ?? t('desktop.workspaceActivity.openImportedTopic');
  const content = (
    <>
      {renderIcon(tone)}
      <span className="min-w-0 flex-1">{message}</span>
      {onOpen ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground/70 group-hover:text-foreground">
          {t('desktop.workspaceActivity.openTopic')}
          <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        </span>
      ) : null}
    </>
  );

  return (
    <div
      aria-live="polite"
      className={appFloatingSurfaceClassName('popover', `absolute left-[calc(var(--workspace-rail-width)+theme(spacing.2))] top-[calc(var(--workspace-top-toolbar-height)+theme(spacing.2))] z-workspace-overlay max-w-80 text-ui-md text-foreground ${onOpen ? 'pointer-events-auto' : 'pointer-events-none'}`)}
      data-testid="clipboard-import-notice"
      role="status"
    >
      {onOpen ? (
        <button
          aria-label={resolvedOpenLabel}
          className="group flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onOpen}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-2 px-3 py-2">{content}</div>
      )}
    </div>
  );
}
