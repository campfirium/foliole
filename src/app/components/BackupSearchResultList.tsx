import type { BackupSearchStatus } from '../../features/settings/components/sections/useBackupSearchSession';
import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { DatabaseBackupSearchMatch } from '../../shared/platform/backupSearch/databaseBackupSearchRuntimeRepository';

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
    <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--app-floating-divider-color)] py-2">
      {props.history.map((match, index) => (
        <button aria-current={index === props.currentIndex ? 'true' : undefined} className={cn('block w-full border-l-2 border-transparent px-5 py-3 text-left hover:bg-foreground/[0.04]', index === props.currentIndex && 'border-l-[var(--app-selection-color)] bg-[var(--app-selection-surface-color)]')} key={`${match.backup_name}-${match.node_id}`} onClick={() => props.onSelect(index)} type="button">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-ui-md font-medium text-foreground">{match.title}</span>
            {match.deleted ? <span className="shrink-0 rounded-sm bg-error/10 px-1.5 py-0.5 text-[11px] text-error">{t('settings.backups.search.trashed')}</span> : null}
          </span>
          <span className="mt-1 block truncate text-xs text-foreground/55">{match.path}</span>
          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-foreground/65">{contentPreview(match.content)}</span>
          <span className="mt-2 block truncate font-mono text-[11px] text-foreground/45">{match.backup_name}</span>
        </button>
      ))}
      {showMessage ? <p className="px-5 py-5 text-sm leading-6 text-foreground/60">{props.message}</p> : null}
    </div>
  );
}

function contentPreview(content: string) {
  return content.replace(/[#>*_`()\]-]+/g, ' ').replaceAll('[', ' ').replace(/\s+/g, ' ').trim();
}
