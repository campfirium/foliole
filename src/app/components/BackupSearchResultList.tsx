import type { BackupSearchStatus } from '../../features/settings/components/sections/useBackupSearchSession';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { DatabaseBackupSearchMatch } from '../../shared/platform/backupSearch/databaseBackupSearchRuntimeRepository';
import {
  AppStatusBadge,
  appFloatingWorkspaceItemClassName,
  appFloatingWorkspaceItemContextClassName,
  appFloatingWorkspaceItemHeadingClassName,
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
  const t = useTranslation();
  const showMessage = Boolean(props.message) && (props.history.length === 0 || props.status !== 'match');
  return (
    <div className={appFloatingWorkspaceListClassName()}>
      {props.history.map((match, index) => (
        <button aria-current={index === props.currentIndex ? 'true' : undefined} className={appFloatingWorkspaceItemClassName()} data-active={index === props.currentIndex} key={`${match.backup_name}-${match.node_id}`} onClick={() => props.onSelect(index)} type="button">
          <span className={appFloatingWorkspaceItemHeadingClassName()}>
            <span className={appFloatingWorkspaceItemTitleClassName()}>{match.title}</span>
            {match.deleted ? <AppStatusBadge label={t('settings.backups.search.trashed')} tone="error" /> : null}
          </span>
          <span className={appFloatingWorkspaceItemContextClassName()}>{match.path}</span>
          <span className={appFloatingWorkspaceItemSummaryClassName()}>{contentPreview(match.content)}</span>
          <span className={appFloatingWorkspaceItemMetaClassName()}>{match.backup_name}</span>
        </button>
      ))}
      {showMessage ? <p className={appFloatingWorkspaceStateClassName()}>{props.message}</p> : null}
    </div>
  );
}

function contentPreview(content: string) {
  return content.replace(/[#>*_`()\]-]+/g, ' ').replaceAll('[', ' ').replace(/\s+/g, ' ').trim();
}
