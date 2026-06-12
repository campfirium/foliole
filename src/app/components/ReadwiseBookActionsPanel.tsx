import { useMemo, type ReactNode } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton } from '../../shared/ui';

import { isReadwiseOriginalFileLoaded, useReadwiseBookActions } from './readwiseBookActionState';

function OriginalFileActionPanel(props: {
  helperText: string;
  isBusy: boolean;
  loadProgress: { detail: string; progress: number };
  pendingAction: 'download' | 'load' | null;
  runDownload: () => Promise<void>;
  runLoad: () => Promise<void>;
  showLoadProgress: boolean;
  statusMessage: string;
}) {
  const t = useTranslation();
  return (
    <div className="px-4 pt-4">
      <div className="mx-auto flex w-full flex-col gap-3 rounded-lg border border-[var(--app-control-border-color)] bg-[var(--app-surface-control-bg)] px-4 py-4 [width:min(100%,var(--document-max-width))]">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">{t('desktop.readwise.original.title')}</h3>
          <p className="text-[13px] text-foreground/60">{props.helperText}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AppButton disabled={props.isBusy} onClick={() => void props.runDownload()} size="sm" variant="default">
            {props.pendingAction === 'download' ? t('desktop.readwise.original.opening') : t('desktop.readwise.original.download')}
          </AppButton>
          <AppButton disabled={props.isBusy} onClick={() => void props.runLoad()} size="sm" variant="ghost">
            {props.pendingAction === 'load' ? t('desktop.readwise.original.preparing') : t('desktop.readwise.original.load')}
          </AppButton>
        </div>
        {props.showLoadProgress ? <OriginalFileLoadProgress detail={props.loadProgress.detail} progress={props.loadProgress.progress} /> : null}
        <p aria-live="polite" className="min-h-5 text-[12px] text-foreground/65">
          {props.statusMessage}
        </p>
      </div>
    </div>
  );
}

function OriginalFileLoadProgress({ detail, progress }: { detail: string; progress: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
        <div
          aria-hidden="true"
          className="h-full rounded-full bg-foreground/70 transition-[width] duration-200"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="text-[12px] text-foreground/65">{detail}</p>
    </div>
  );
}

export function ReadwiseBookActionsPanel({
  activeNodeId,
  children
}: {
  activeContent?: string;
  activeNodeId: string | null;
  children?: ReactNode;
}) {
  const t = useTranslation();
  const { book, isLoading, loadProgress, pendingAction, runDownload, runLoad, statusMessage } =
    useReadwiseBookActions(activeNodeId);

  const helperText = useMemo(() => {
    if (!book) {
      return '';
    }
    return isReadwiseOriginalFileLoaded(book)
      ? t('desktop.readwise.original.loaded')
      : t('desktop.readwise.original.empty');
  }, [book, t]);

  if (!book && isLoading) {
    return <>{children ?? null}</>;
  }
  if (!book || !activeNodeId || book.importStatus !== 'pending') {
    return <>{children ?? null}</>;
  }

  const isBusy = pendingAction !== null;
  const showLoadProgress = pendingAction === 'load' || loadProgress.progress > 0;

  return (
    <>
      {children ?? null}
      <OriginalFileActionPanel
        helperText={helperText}
        isBusy={isBusy}
        loadProgress={loadProgress}
        pendingAction={pendingAction}
        runDownload={runDownload}
        runLoad={runLoad}
        showLoadProgress={showLoadProgress}
        statusMessage={statusMessage}
      />
    </>
  );
}
