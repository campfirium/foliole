import type { NativeReadwiseApiScheduleStatus } from '../../../lib/platform/nativeReadwiseApiImportContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { readwiseApiPhasePresentation, readwiseFailureReason } from './ReadwiseApiTaskStatus';
import type { ReadwiseMigrationState } from './useReadwiseSourceMigration';

export function ReadwiseMigrationProgress(props: {
  migration: ReadwiseMigrationState;
  schedule: NativeReadwiseApiScheduleStatus | null;
}) {
  const t = useTranslation();
  const presentation = migrationPresentation(props.migration, t)
    ?? readwiseApiPhasePresentation(props.schedule, t);
  if (!presentation) return null;
  return (
    <div
      aria-live="polite"
      className={`flex items-center gap-2 px-settings-panel-x pb-settings-panel-y text-ui-md ${presentation.failed ? 'text-error' : 'text-foreground'}`}
      role="status"
    >
      {!presentation.failed ? <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-current opacity-45" /> : null}
      <span>{presentation.text}</span>
    </div>
  );
}

function migrationPresentation(
  migration: ReadwiseMigrationState,
  t: ReturnType<typeof useTranslation>
) {
  if (!migration.phase) return null;
  const phase = migration.phase === 'indexing'
    ? t('desktop.readwise.cutover.phase.indexing')
    : t('desktop.readwise.cutover.phase.merging');
  if (!migration.failed) {
    return { failed: false, text: `${t('desktop.readwise.cutover.status')} · ${phase}` };
  }
  const failed = migration.phase === 'indexing'
    ? t('desktop.readwise.cutover.phase.indexFailed')
    : t('desktop.readwise.cutover.phase.mergeFailed');
  const reason = readwiseFailureReason(migration.errorReason, t);
  return { failed: true, text: `${t('desktop.readwise.cutover.status')} · ${failed}${reason ? ` · ${reason}` : ''}` };
}
