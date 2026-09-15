import type { NativeReadwiseApiScheduleStatus } from '../../../lib/platform/nativeReadwiseApiImportContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppSpinner } from '../../shared/ui';

import { readwiseFailureReason } from './ReadwiseApiTaskStatus';
import type { ReadwiseMigrationState } from './useReadwiseSourceMigration';

export function ReadwiseMigrationProgress(props: {
  compact?: boolean;
  migration: ReadwiseMigrationState;
  taskStatus: NativeReadwiseApiScheduleStatus | null;
}) {
  const t = useTranslation();
  const presentation = migrationPresentation(props.migration, props.taskStatus, t, props.compact ?? false);
  if (!presentation) return null;
  if (props.compact) {
    return (
      <span aria-hidden="true" className="whitespace-nowrap text-ui-sm text-foreground/50">
        {presentation.text}
      </span>
    );
  }
  return (
    <div
      aria-live="polite"
      className={`flex items-center gap-2 text-ui-md ${presentation.failed ? 'text-error' : 'text-foreground'}`}
      role="status"
    >
      {presentation.active
        ? <AppSpinner decorative size="sm" tone={presentation.failed ? 'danger' : 'neutral'} />
        : null}
      <span>{presentation.text}</span>
    </div>
  );
}

function migrationPresentation(
  migration: ReadwiseMigrationState,
  taskStatus: NativeReadwiseApiScheduleStatus | null,
  t: ReturnType<typeof useTranslation>,
  compact: boolean
) {
  if (!migration.phase) {
    if (taskStatus?.cutover.status === 'completed') {
      return {
        active: false,
        failed: false,
        text: taskStatus.initial_sync.status === 'completed'
          ? t('desktop.readwise.api.enabled')
          : `${t('desktop.readwise.api.enabled')} · ${t('desktop.readwise.api.firstSyncPending')}`
      };
    }
    return taskStatus?.cutover.status === 'in_progress'
      ? {
          active: true,
          failed: false,
          text: progressText(
            `${t('desktop.readwise.cutover.status')} · ${t('desktop.readwise.cutover.phase.indexing')}`, compact,
            migration.completedCount,
            null
          )
        }
      : null;
  }
  const phase = migration.phase === 'indexing'
    ? t('desktop.readwise.cutover.phase.indexing')
    : t('desktop.readwise.cutover.phase.merging');
  if (!migration.failed) {
    return {
      active: true,
      failed: false,
      text: progressText(
        `${t('desktop.readwise.cutover.status')} · ${phase}`, compact,
        migration.completedCount,
        migration.totalCount
      )
    };
  }
  const failed = migration.phase === 'indexing'
    ? t('desktop.readwise.cutover.phase.indexFailed')
    : t('desktop.readwise.cutover.phase.mergeFailed');
  const reason = readwiseFailureReason(migration.errorReason, t);
  return {
    active: false,
    failed: true,
    text: compact
      ? `${t('desktop.readwise.cutover.status')} · ${failed}`
      : `${withProgress(
          `${t('desktop.readwise.cutover.status')} · ${failed}`,
          migration.completedCount,
          migration.totalCount
        )}${reason ? ` · ${reason}` : ''}`
  };
}

function progressText(text: string, compact: boolean, completedCount: number, totalCount: number | null) {
  return compact ? text : withProgress(text, completedCount, totalCount);
}

function withProgress(text: string, completedCount: number, totalCount: number | null) {
  if (completedCount === 0 && totalCount === null) return text;
  return `${text} · ${completedCount}${totalCount === null ? '' : ` / ${totalCount}`}`;
}
