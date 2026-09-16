import type { NativeReadwiseSourceCutoverFailure } from '../../../lib/platform/nativeReadwiseSourceCutoverContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { SettingsRow, SettingsSection } from '../../shared/ui';

export function ReadwiseMigrationFailures(props: {
  failures: NativeReadwiseSourceCutoverFailure[];
}) {
  const t = useTranslation();
  if (props.failures.length === 0) return null;
  return (
    <SettingsSection
      ariaLabel={t('desktop.readwise.cutover.issues.title')}
      description={t('desktop.readwise.cutover.issues.description', { count: props.failures.length })}
      title={t('desktop.readwise.cutover.issues.title')}
    >
      {props.failures.map((failure) => {
        const diagnosis = cutoverFailureDiagnosis(failure.reason, t);
        return (
          <SettingsRow
            description={t('desktop.readwise.cutover.result.failureDetail', {
              code: diagnosis.code
                ? ` · ${t('desktop.readwise.cutover.failureCode', { code: diagnosis.code })}` : '',
              reason: diagnosis.reason,
              stage: t(`desktop.readwise.cutover.failureStage.${failure.stage}`)
            })}
            key={`${failure.remote_id}:${failure.stage}`}
            readonly
            title={failure.title}
          />
        );
      })}
    </SettingsSection>
  );
}

function cutoverFailureDiagnosis(
  reason: string,
  t: ReturnType<typeof useTranslation>
): { code: string | null; reason: string } {
  if (reason === 'readwise_source_cutover_document_timeout') {
    return { code: reason, reason: t('desktop.readwise.cutover.failureReason.timeout') };
  }
  if (reason === 'original_file_download_failed') {
    return { code: reason, reason: t('desktop.readwise.cutover.failureReason.originalFileDownloadFailed') };
  }
  if (reason === 'readwise_source_cutover_annotation_binding_missing') {
    return { code: reason, reason: t('desktop.readwise.cutover.failureReason.annotationBindingMissing') };
  }
  if (/^EPERM:/u.test(reason)) {
    return { code: 'file_access_denied', reason: t('desktop.readwise.cutover.failureReason.fileAccessDenied') };
  }
  if (/^original_epub_/u.test(reason)) {
    return { code: reason, reason: t('desktop.readwise.cutover.failureReason.epubImportFailed') };
  }
  if (reason === 'request_failed') {
    return { code: reason, reason: t('desktop.readwise.cutover.failureReason.requestFailed') };
  }
  return {
    code: /^[a-z0-9_]+$/u.test(reason) ? reason : null,
    reason: t('desktop.readwise.cutover.failureReason.processingFailed')
  };
}
