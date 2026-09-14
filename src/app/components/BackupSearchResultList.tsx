import { Trash2 } from 'lucide-react';

import type { BackupSearchStatus } from '../../features/settings/components/sections/useBackupSearchSession';
import { useLocalization } from '../../shared/localization/LocalizationProvider';
import type { DatabaseBackupSearchMatch } from '../../shared/platform/backupSearch/databaseBackupSearchRuntimeRepository';
import {
  appFloatingWorkspaceItemClassName,
  appFloatingWorkspaceItemContextClassName,
  appFloatingWorkspaceItemMetaClassName,
  appFloatingWorkspaceItemSummaryClassName,
  appFloatingWorkspaceItemTitleClassName,
  appFloatingWorkspaceListClassName,
  appFloatingWorkspaceStateClassName
} from '../../shared/ui';

export function BackupSearchResultList(props: {
  currentIndex: number;
  history: DatabaseBackupSearchMatch[];
  message: string;
  onSelect: (index: number) => void;
  status: BackupSearchStatus;
}) {
  const { locale, t } = useLocalization();
  const showMessage = Boolean(props.message) && (props.history.length === 0 || props.status !== 'match');
  return (
    <div className={appFloatingWorkspaceListClassName()}>
      {props.history.map((match, index) => (
        <button aria-current={index === props.currentIndex ? 'true' : undefined} className={appFloatingWorkspaceItemClassName()} data-active={index === props.currentIndex} key={`${match.backup_name}-${match.node_id}`} onClick={() => props.onSelect(index)} type="button">
          <span className={appFloatingWorkspaceItemMetaClassName()} title={match.backup_name}>
            <span>{formatBackupTime(match.backup_updated_at, locale)}</span>
            {match.deleted ? <Trash2 aria-label={t('settings.backups.search.trashed')} size={13} strokeWidth={1.7} /> : null}
          </span>
          <span className={appFloatingWorkspaceItemTitleClassName()}>{match.title}</span>
          {match.path ? <span className={appFloatingWorkspaceItemContextClassName()}>{match.path}</span> : null}
          <span className={appFloatingWorkspaceItemSummaryClassName()}>{contentPreview(match.content)}</span>
        </button>
      ))}
      {showMessage ? <p className={appFloatingWorkspaceStateClassName()}>{props.message}</p> : null}
    </div>
  );
}

function formatBackupTime(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short'
  }).format(date);
}

function contentPreview(content: string) {
  return content.replace(/[#>*_`()\]-]+/g, ' ').replaceAll('[', ' ').replace(/\s+/g, ' ').trim();
}
