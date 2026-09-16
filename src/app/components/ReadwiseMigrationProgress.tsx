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
    : t('desktop.readwise.cutover.phase.merging');
  if (!migration.failed) {
    return {
      active: true,
      failed: false,
      retryable: false,
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
    retryable: true,
    text: compact
      ? `${t('desktop.readwise.cutover.status')} · ${failed}`
      : `${withProgress(
          `${t('desktop.readwise.cutover.status')} · ${failed}`,
          migration.completedCount,
          migration.totalCount
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
  const initialRun = taskStatus?.initial_sync.lifecycle;
  if (initialRun?.status === 'running') {
    const phase = initialRun.stage === 'fetching'
      ? t('desktop.readwise.api.tasks.indexing')
      : t('desktop.readwise.cutover.phase.indexing');
    return {
      active: true,
      failed: false,
      retryable: false,
      text: progressText(
        `${t('desktop.readwise.cutover.status')} · ${phase}`,
        compact,
        initialRun.progress?.completed_count ?? 0,
        initialRun.progress?.total_count ?? null
      )
    };
  }
  if (taskStatus?.cutover.status === 'completed') {
    return taskStatus.initial_sync.status === 'completed' ? null : {
      active: false, failed: false, retryable: false,
      text: t('desktop.readwise.api.firstSyncPending')
    };
  }
  return taskStatus?.cutover.status === 'in_progress' ? {
    active: true,
    failed: false,
    retryable: false,
    text: progressText(
      `${t('desktop.readwise.cutover.status')} · ${t('desktop.readwise.cutover.phase.indexing')}`,
      compact, migration.completedCount, null
    )
  } : null;
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

function progressText(text: string, compact: boolean, completedCount: number, totalCount: number | null) {
  return compact ? text : withProgress(text, completedCount, totalCount);
}

function withProgress(text: string, completedCount: number, totalCount: number | null) {
  if (completedCount === 0 && totalCount === null) return text;
  return `${text} · ${completedCount}${totalCount === null ? '' : ` / ${totalCount}`}`;
}
