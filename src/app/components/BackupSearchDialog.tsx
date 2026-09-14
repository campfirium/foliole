import { X } from 'lucide-react';
import type { FormEvent } from 'react';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { BackupSearchStatus } from '../../features/settings/components/sections/useBackupSearchSession';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { DatabaseBackupSearchMatch } from '../../shared/platform/backupSearch/databaseBackupSearchRuntimeRepository';
import {
  AppButton,
  AppDialog,
  AppDialogActions,
  AppDialogBody,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppIconButton,
  settingsFieldClassName
} from '../../shared/ui';

export interface BackupSearchDialogState {
  current: DatabaseBackupSearchMatch | null;
  currentIndex: number;
  error: string;
  hasNextInHistory: boolean;
  historyLength: number;
  query: string;
  skippedBackupCount: number;
  status: BackupSearchStatus;
}

export function BackupSearchDialog(props: {
  onCancel: () => void;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  open: boolean;
  state: BackupSearchDialogState;
}) {
  const t = useTranslation();
  const busy = props.state.status === 'starting' || props.state.status === 'searching';

  return (
    <AppDialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="h-[min(760px,calc(100vh-32px))] w-[min(1040px,calc(100vw-32px))]" layout="task">
          <AppDialogTitle>{t('settings.backups.search.title')}</AppDialogTitle>
          <AppIconButton className="absolute right-4 top-3 z-10" icon={<X className="size-4" />} label={t('settings.backups.search.close')} onClick={props.onClose} />
          <AppDialogBody className="flex flex-col !p-0">
            <BackupSearchForm busy={busy} onCancel={props.onCancel} onQueryChange={props.onQueryChange} onSubmit={props.onSubmit} query={props.state.query} />
            <BackupSearchBody state={props.state} />
          </AppDialogBody>
          <AppDialogActions>
            <span className="mr-auto text-xs text-foreground/55">
              {props.state.historyLength > 0
                ? t('settings.backups.search.position', { current: props.state.currentIndex + 1, total: props.state.historyLength })
                : ''}
            </span>
            <AppButton disabled={props.state.currentIndex <= 0 || busy} onClick={props.onPrevious}>
              {t('settings.backups.search.previous')}
            </AppButton>
            <AppButton
              disabled={busy || !props.state.current || (props.state.status === 'complete' && !props.state.hasNextInHistory)}
              onClick={props.onNext}
            >
              {t('settings.backups.search.continue')}
            </AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function BackupSearchForm(props: {
  busy: boolean;
  onCancel: () => void;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  query: string;
}) {
  const t = useTranslation();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!props.busy && props.query.trim()) props.onSubmit();
  };
  return (
    <form className="flex shrink-0 items-center gap-2 border-b border-[var(--app-floating-divider-color)] px-6 py-4" onSubmit={submit}>
      <label className="sr-only" htmlFor="backup-search-query">{t('settings.backups.search.input')}</label>
      <input autoFocus className={settingsFieldClassName('min-w-0 flex-1')} disabled={props.busy} id="backup-search-query" onChange={(event) => props.onQueryChange(event.target.value)} placeholder={t('settings.backups.search.placeholder')} value={props.query} />
      <AppButton disabled={props.busy || !props.query.trim()} type="submit">
        {props.busy ? t('settings.backups.search.searching') : t('settings.backups.search.submit')}
      </AppButton>
      {props.busy ? <AppButton onClick={props.onCancel}>{t('settings.backups.search.cancel')}</AppButton> : null}
    </form>
  );
}

function BackupSearchBody(props: { state: BackupSearchDialogState }) {
  const t = useTranslation();
  const { editorAppearanceKey } = useAppearanceSettings();
  const current = props.state.current;
  if (!current) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
        <p className="max-w-xl text-sm leading-6 text-foreground/65">{statusMessage(props.state, t)}</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[var(--app-floating-divider-color)] px-6 py-3">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{current.title}</h3>
          {current.deleted ? <span className="rounded-sm bg-error/10 px-1.5 py-0.5 text-[11px] text-error">{t('settings.backups.search.trashed')}</span> : null}
        </div>
        <p className="mt-1 truncate text-xs text-foreground/55">{current.path}</p>
        <p className="mt-1 text-xs text-foreground/45">{t('settings.backups.search.sourceTime', { time: new Date(current.backup_updated_at).toLocaleString() })}</p>
        {props.state.status === 'complete' ? <p className="mt-2 text-xs text-foreground/60">{statusMessage(props.state, t)}</p> : null}
      </div>
      <div className="min-h-0 flex-1 bg-canvas">
        <MarkdownEditor
          className="h-full"
          key={`backup-search-${editorAppearanceKey}-${current.backup_updated_at}-${current.node_id}`}
          nodeId={null}
          onChange={() => undefined}
          readOnly
          value={current.content}
        />
      </div>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslation>;

function statusMessage(state: BackupSearchDialogState, t: Translate) {
  if (state.status === 'starting' || state.status === 'searching') return t('settings.backups.search.searchingBackups');
  if (state.status === 'error') return t('settings.backups.search.failed', { message: state.error });
  if (state.status === 'cancelled') return t('settings.backups.search.cancelled');
  if (state.status === 'complete') {
    return state.skippedBackupCount > 0
      ? t('settings.backups.search.completePartial', { count: state.skippedBackupCount })
      : t('settings.backups.search.complete');
  }
  return t('settings.backups.search.initial');
}
