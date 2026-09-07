import type { NativeReadwiseReconcileResult } from '../../../lib/platform/nativeReadwiseApiImportContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../../shared/ui';

function ReconcileResult(props: { result: NativeReadwiseReconcileResult }) {
  const t = useTranslation();
  if (props.result.status !== 'completed') {
    return <span className="mt-1 block text-error">{t(props.result.status === 'cancelled'
      ? 'desktop.readwise.api.reconcile.cancelled' : 'desktop.readwise.api.reconcile.failed')}</span>;
  }
  return (
    <span className="mt-1 block text-foreground/70" role="status">
      {t('desktop.readwise.api.reconcile.summary', {
        deleted: props.result.export_deleted_count,
        missing: props.result.reader_missing_count,
        present: props.result.present_count,
        unconfirmed: props.result.unconfirmed_count
      })}
    </span>
  );
}

export function ReadwiseApiImportSection(props: {
  disabled: boolean;
  isRunning: boolean;
  onPreview: () => void;
  onCancelReconcile: () => void;
  onReconcile: () => void;
  reconcileIsRunning: boolean;
  reconcileResult: NativeReadwiseReconcileResult | null;
}) {
  const t = useTranslation();
  return (
    <SettingsSection
      ariaLabel={t('desktop.readwise.api.import.title')}
      description={t('desktop.readwise.api.import.description')}
      title={t('desktop.readwise.api.import.title')}
    >
      <SettingsRow
        description={t('desktop.readwise.api.import.actionDescription')}
        title={t('desktop.readwise.api.import.actionTitle')}
      >
        <SettingsControlSlot>
          <AppButton disabled={props.disabled} onClick={props.onPreview} size="sm" variant="emphasis">
            {props.isRunning
              ? t('desktop.readwise.api.import.preparing')
              : t('desktop.readwise.api.import.preview')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow
        description={(
          <>
            {t('desktop.readwise.api.reconcile.actionDescription')}
            {props.reconcileResult ? <ReconcileResult result={props.reconcileResult} /> : null}
          </>
        )}
        title={t('desktop.readwise.api.reconcile.actionTitle')}
      >
        <SettingsControlSlot>
          <AppButton
            disabled={props.disabled && !props.reconcileIsRunning}
            onClick={props.reconcileIsRunning ? props.onCancelReconcile : props.onReconcile}
            size="sm"
            variant="default"
          >
            {props.reconcileIsRunning
              ? t('desktop.readwise.api.reconcile.cancel')
              : t('desktop.readwise.api.reconcile.action')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
