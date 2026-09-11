import type { NativeReadwiseApiScheduleStatus } from '../../../lib/platform/nativeReadwiseApiImportContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppSpinner } from '../../shared/ui';

import { readwiseFailureReason } from './ReadwiseApiTaskStatus';
import type { ReadwiseMigrationState } from './useReadwiseSourceMigration';

export function ReadwiseMigrationProgress(props: {
  migration: ReadwiseMigrationState;
  taskStatus: NativeReadwiseApiScheduleStatus | null;
}) {
  const t = useTranslation();
  const presentation = migrationPresentation(props.migration, props.taskStatus, t);
  if (!presentation) return null;
  return (
    <div
      aria-live="polite"
      className={`flex items-center gap-2 text-ui-md ${presentation.failed ? 'text-error' : 'text-foreground'}`}
      role="status"
    >
      <AppSpinner decorative size="sm" tone={presentation.failed ? 'danger' : 'neutral'} />
      <span>{presentation.text}</span>
    </div>
  );
}

function migrationPresentation(
  migration: ReadwiseMigrationState,
  taskStatus: NativeReadwiseApiScheduleStatus | null,
  t: ReturnType<typeof useTranslation>
) {
  if (!migration.phase) {
    return taskStatus?.cutover.status === 'in_progress'
      ? {
          failed: false,
          text: withProgress(
            `${t('desktop.readwise.cutover.status')} · ${t('desktop.readwise.cutover.phase.indexing')}`,
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
      failed: false,
      text: withProgress(
        `${t('desktop.readwise.cutover.status')} · ${phase}`,
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
    failed: true,
    text: `${withProgress(
      `${t('desktop.readwise.cutover.status')} · ${failed}`,
      migration.completedCount,
      migration.totalCount
    )}${reason ? ` · ${reason}` : ''}`
  };
}

function withProgress(text: string, completedCount: number, totalCount: number | null) {
  return `${text} · ${completedCount}${totalCount === null ? '' : ` / ${totalCount}`}`;
}
