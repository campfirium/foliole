import type { NativeReadwiseApiScheduleStatus } from '../../../lib/platform/nativeReadwiseApiImportContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppSpinner } from '../../shared/ui';

import { readwiseFailureReason } from './ReadwiseApiTaskStatus';
import type { ReadwiseMigrationState } from './useReadwiseSourceMigration';

interface MigrationPresentation {
  active: boolean;
  failed: boolean;
  retryable: boolean;
  text: string;
}

export function ReadwiseMigrationProgress(props: {
  compact?: boolean;
  migration: ReadwiseMigrationState;
  onRetry?: () => void;
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
      className={`flex items-start gap-2 text-ui-md ${presentation.failed ? 'text-error' : 'text-foreground'}`}
      role="status"
    >
      {presentation.active
        ? <AppSpinner decorative size="sm" tone={presentation.failed ? 'danger' : 'neutral'} />
        : null}
      <span>{presentation.text}</span>
      {presentation.retryable && props.onRetry ? (
        <AppButton onClick={props.onRetry} size="sm" variant="default">
          {t('desktop.readwise.cutover.retry')}
        </AppButton>
      ) : null}
    </div>
  );
}

function migrationPresentation(
  migration: ReadwiseMigrationState,
  taskStatus: NativeReadwiseApiScheduleStatus | null,
  t: ReturnType<typeof useTranslation>,
  compact: boolean
): MigrationPresentation | null {
  const failures = migration.failures ?? [];
  if (!migration.phase) return inactiveMigrationPresentation(migration, taskStatus, t, compact, failures);
  const phase = migration.phase === 'indexing'
    ? t('desktop.readwise.cutover.phase.indexing')
    : migration.existingTopicCount === 0
      ? t('desktop.readwise.cutover.phase.importing')
      : t('desktop.readwise.cutover.phase.merging');
  if (!migration.failed) {
    const progress = resolvedCutoverProgress(migration, taskStatus);
    return {
      active: true,
      failed: false,
      retryable: false,
      text: progressText(
        `${t('desktop.readwise.cutover.status')} · ${phase}`, compact,
        progress.completedCount,
        progress.totalCount, migration.phase === 'indexing'
      )
    };
  }
  const failed = migration.phase === 'indexing'
    ? t('desktop.readwise.cutover.phase.indexFailed')
    : migration.existingTopicCount === 0
      ? t('desktop.readwise.cutover.phase.importFailed')
      : t('desktop.readwise.cutover.phase.mergeFailed');
  const reason = readwiseFailureReason(migration.errorReason, t);
  return {
    active: false,
    failed: true,
    retryable: true,
    text: compact
      ? `${t('desktop.readwise.cutover.status')} · ${failed}`
      : `${withProgress(
          `${t('desktop.readwise.cutover.status')} · ${failed}`,
          migration.completedCount,
          migration.totalCount, migration.phase === 'indexing'
        )}${reason ? ` · ${reason}` : ''}`
  };
}

function inactiveMigrationPresentation(
  migration: ReadwiseMigrationState,
  taskStatus: NativeReadwiseApiScheduleStatus | null,
  t: ReturnType<typeof useTranslation>,
  compact: boolean,
  failures: NonNullable<ReadwiseMigrationState['failures']>
) {
  if (failures.length > 0) return completedFailurePresentation(failures, t);
  return taskStatus?.cutover.status === 'in_progress' ? {
    active: true,
    failed: false,
    retryable: false,
    text: progressText(
      `${t('desktop.readwise.cutover.status')} · ${t('desktop.readwise.cutover.phase.indexing')}`,
      compact, taskStatus.cutover.completed_count, taskStatus.cutover.total_count, true
    )
  } : null;
}

function resolvedCutoverProgress(
  migration: ReadwiseMigrationState,
  taskStatus: NativeReadwiseApiScheduleStatus | null
) {
  const projected = taskStatus?.cutover;
  if (migration.totalCount !== null || projected?.status !== 'in_progress') {
    return { completedCount: migration.completedCount, totalCount: migration.totalCount };
  }
  return { completedCount: projected.completed_count, totalCount: projected.total_count };
}

function completedFailurePresentation(
  failures: NonNullable<ReadwiseMigrationState['failures']>,
  t: ReturnType<typeof useTranslation>
) {
  return {
    active: false,
    failed: true,
    retryable: false,
    text: t('desktop.readwise.cutover.result.completedWithFailures', { count: failures.length })
  };
}

function progressText(text: string, compact: boolean, completedCount: number, totalCount: number | null, percent = false) {
  return compact ? text : withProgress(text, completedCount, totalCount, percent);
}

function withProgress(text: string, completedCount: number, totalCount: number | null, percent = false) {
  if (percent) return totalCount === null || totalCount === 0
    ? completedCount === 0 ? `${text} · 0%` : text
    : `${text} · ${Math.floor(completedCount * 100 / totalCount)}%`;
  if (completedCount === 0 && totalCount === null) return text;
  return `${text} · ${completedCount}${totalCount === null ? '' : ` / ${totalCount}`}`;
}
