import { useEffect, useState } from 'react';

import type { AttachmentMaintenanceRequest, AttachmentMaintenanceStatus } from '../../../../../lib/platform/attachmentMaintenanceContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { runAttachmentMaintenance } from '../../../../shared/platform/attachments/attachmentMaintenance';
import { AppButton, AppInput, AppSwitch, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import { AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../../shared/ui/Dialog';

function useAttachmentStorageSettings() {
  const [status, setStatus] = useState<AttachmentMaintenanceStatus | null>(null);
  const [threshold, setThreshold] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void runAttachmentMaintenance({ action: 'status' }).then((result) => {
      if (!active) return;
      setStatus(result); if (result) setThreshold(String(result.observationThreshold));
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  async function run(request: AttachmentMaintenanceRequest) {
    setBusy(true); setError(false);
    try { setStatus(await runAttachmentMaintenance(request)); }
    catch { setError(true); }
    finally { setBusy(false); }
  }

  return { status, threshold, setThreshold, busy, error, run };
}

export function SettingsAttachmentStorageSection() {
  const t = useTranslation();
  const { status, threshold, setThreshold, busy, error, run } = useAttachmentStorageSettings();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  if (!status && !error) return null;
  return (
    <SettingsSection ariaLabel={t('settings.attachments.title')} title={t('settings.attachments.title')}>
      {error ? <p role="alert">{t('settings.attachments.error')}</p> : null}
      <SettingsRow title={t('settings.attachments.used')} description={status ? bytes(status.usedBytes) : '—'}>
        <SettingsControlSlot><AppButton disabled={busy} onClick={() => void run({ action: 'status' })} size="sm">
          {t('settings.attachments.refresh')}
        </AppButton></SettingsControlSlot>
      </SettingsRow>
      <SettingsRow title={t('settings.attachments.threshold')} description={t('settings.attachments.thresholdHint')}>
        <SettingsControlSlot><AppInput aria-label={t('settings.attachments.threshold')} disabled={busy || !status}
          min={1} type="number" value={threshold} onChange={(event) => setThreshold(event.target.value)}
          onBlur={() => {
            if (status && Number.isSafeInteger(Number(threshold)) && Number(threshold) > 0) {
              void run({ action: 'configure', settings: { automatic: status.automatic, observationThreshold: Number(threshold) } });
            } else setThreshold(String(status?.observationThreshold ?? 30));
          }} /></SettingsControlSlot>
      </SettingsRow>
      <SettingsRow title={t('settings.attachments.automatic')} description={t('settings.attachments.automaticHint')}>
        <SettingsControlSlot><AppSwitch aria-label={t('settings.attachments.automatic')} checked={status?.automatic ?? false}
          disabled={busy || !status} onCheckedChange={(automatic) => {
            if (status) void run({ action: 'configure', settings: { automatic, observationThreshold: status.observationThreshold } });
          }} /></SettingsControlSlot>
      </SettingsRow>
      <SettingsRow title={t('settings.attachments.eligible')} description={status ? bytes(status.eligibleBytes) : '—'}>
        <SettingsControlSlot><AppButton disabled={busy || !status} onClick={() => void run({ action: 'clean' })} size="sm">
          {t('settings.attachments.clean')}
        </AppButton></SettingsControlSlot>
      </SettingsRow>
      <SettingsRow title={t('settings.attachments.trash')} description={status ? bytes(status.trashBytes) : '—'}>
        <SettingsControlSlot>
          <AppButton disabled={busy || !status?.trash.length} size="sm"
            onClick={() => void run({ action: 'restore', storageKeys: status?.trash.map((file) => file.storageKey) ?? [] })}>
            {t('settings.attachments.restore')}
          </AppButton>
          <AppButton disabled={busy || !status?.trash.length} size="sm" onClick={() => setConfirmEmpty(true)}>
            {t('settings.attachments.empty')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
      <AppDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AppDialogPortal><AppDialogOverlay /><AppDialogContent layout="task" className="w-[calc(100vw-3rem)] max-w-[420px]">
          <AppDialogTitle>{t('settings.attachments.empty')}</AppDialogTitle>
          <AppDialogBody><AppDialogDescription>{t('settings.attachments.emptyHint')}</AppDialogDescription></AppDialogBody>
          <AppDialogActions>
          <AppButton onClick={() => setConfirmEmpty(false)}>{t('common.cancel')}</AppButton>
          <AppButton disabled={busy} onClick={() => {
            setConfirmEmpty(false); void run({ action: 'empty-trash' });
          }}>{t('settings.attachments.empty')}</AppButton>
        </AppDialogActions>
        </AppDialogContent></AppDialogPortal>
      </AppDialog>
    </SettingsSection>
  );
}

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
