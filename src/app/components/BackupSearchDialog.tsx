import { ArrowRight, X } from 'lucide-react';
import type { FormEvent } from 'react';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { BackupSearchStatus } from '../../features/settings/components/sections/useBackupSearchSession';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { DatabaseBackupSearchMatch } from '../../shared/platform/backupSearch/databaseBackupSearchRuntimeRepository';
import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppIconButton,
  appFloatingWorkspaceClassName,
  appFloatingWorkspaceFormClassName,
  appFloatingWorkspaceHeaderClassName,
  appFloatingWorkspaceInputClassName,
  appFloatingWorkspacePreviewClassName,
  appFloatingWorkspaceSidebarClassName,
  appFloatingWorkspaceTitleClassName
} from '../../shared/ui';

import { BackupSearchResultList } from './BackupSearchResultList';

export interface BackupSearchDialogState {
  current: DatabaseBackupSearchMatch | null;
  currentIndex: number;
  error: string;
  history: DatabaseBackupSearchMatch[];
  query: string;
  skippedBackupCount: number;
  status: BackupSearchStatus;
  submittedQuery: string;
}

export function BackupSearchDialog(props: {
  onCancel: () => void;
  onClose: () => void;
  onContinue: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (index: number) => void;
  onSubmit: () => void;
  open: boolean;
  state: BackupSearchDialogState;
}) {
  const t = useTranslation();
  const { editorAppearanceKey } = useAppearanceSettings();
  const current = props.state.current;
  return (
    <AppDialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className={appFloatingWorkspaceClassName()} layout="bare">
          <AppDialogTitle className="sr-only">{t('settings.backups.search.title')}</AppDialogTitle>
          <section className={appFloatingWorkspaceSidebarClassName()}>
            <div className={appFloatingWorkspaceHeaderClassName()}>
              <h2 className={appFloatingWorkspaceTitleClassName()}>{t('settings.backups.search.title')}</h2>
              <BackupSearchForm {...props} />
            </div>
            <BackupSearchResultList currentIndex={props.state.currentIndex} history={props.state.history} message={statusMessage(props.state, t)} onSelect={props.onSelect} status={props.state.status} />
          </section>
          <section className={appFloatingWorkspacePreviewClassName()}>
            {current ? (
              <MarkdownEditor className="h-full" key={`backup-search-${editorAppearanceKey}-${current.backup_name}-${current.node_id}`} nodeId={null} onChange={() => undefined} readOnly value={current.content} />
            ) : null}
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function BackupSearchForm(props: {
  onCancel: () => void;
  onContinue: () => void;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  state: BackupSearchDialogState;
}) {
  const t = useTranslation();
  const busy = props.state.status === 'starting' || props.state.status === 'searching';
  const sameQuery = props.state.query.trim() === props.state.submittedQuery;
  const canContinue = sameQuery && props.state.status === 'match';
  const complete = sameQuery && props.state.status === 'complete';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!props.state.query.trim() || busy || complete) return;
    if (canContinue) props.onContinue();
    else props.onSubmit();
  };
  return (
    <form className={appFloatingWorkspaceFormClassName()} onSubmit={submit}>
      <label className="sr-only" htmlFor="backup-search-query">{t('settings.backups.search.input')}</label>
      <input autoFocus className={appFloatingWorkspaceInputClassName()} disabled={busy} id="backup-search-query" onChange={(event) => props.onQueryChange(event.target.value)} placeholder={t('settings.backups.search.placeholder')} value={props.state.query} />
      <AppIconButton
        className="text-foreground/40 hover:text-foreground/60"
        disabled={!busy && (!props.state.query.trim() || complete)}
        icon={busy
          ? <X aria-hidden="true" size={15} strokeWidth={1.8} />
          : <ArrowRight aria-hidden="true" size={15} strokeWidth={1.8} />}
        label={busy
          ? t('settings.backups.search.cancel')
          : complete
            ? t('settings.backups.search.noMoreResults')
            : canContinue
              ? t('settings.backups.search.continue')
              : t('settings.backups.search.submit')}
        onClick={busy ? props.onCancel : undefined}
        type={busy ? 'button' : 'submit'}
      />
    </form>
  );
}

type Translate = ReturnType<typeof useTranslation>;

function statusMessage(state: BackupSearchDialogState, t: Translate) {
  if (state.status === 'starting' || state.status === 'searching') return t('settings.backups.search.searchingBackups');
  if (state.status === 'error') return t('settings.backups.search.failed', { message: state.error });
  if (state.status === 'cancelled') return t('settings.backups.search.cancelled');
  if (state.status === 'complete') return state.skippedBackupCount > 0
    ? t('settings.backups.search.completePartial', { count: state.skippedBackupCount })
    : t('settings.backups.search.complete');
  return state.history.length === 0 ? t('settings.backups.search.initial') : '';
}
