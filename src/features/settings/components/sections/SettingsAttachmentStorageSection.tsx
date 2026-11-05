import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppInput, AppSwitch, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import { AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../../shared/ui/Dialog';

import { AttachmentCleanupThresholdDialog } from './AttachmentCleanupThresholdDialog';
import { useAttachmentStorageSettings } from './useAttachmentStorageSettings';

export function SettingsAttachmentStorageSection({ unavailable = false, mobile = false }: { unavailable?: boolean; mobile?: boolean }) {
  const t = useTranslation();
  const { status, threshold, setThreshold, busy, error, run } = useAttachmentStorageSettings();
  const [editThreshold, setEditThreshold] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  if (!status && !error && !unavailable) return null;
  return (
    <SettingsSection ariaLabel={t('settings.attachments.title')} {...(!mobile ? { title: t('settings.attachments.title') } : {})}>
      {error ? <p role="alert">{t('settings.attachments.error')}</p> : null}
      <SettingsRow controlLayout="inline" title={t('settings.attachments.automatic')} description={t('settings.attachments.automaticHint')}>
        <SettingsControlSlot><AppSwitch aria-label={t('settings.attachments.automatic')} checked={status?.automatic ?? false}
          disabled={busy || !status} onCheckedChange={(automatic) => {
            if (status) void run({ action: 'configure', settings: { automatic, observationThreshold: status.observationThreshold } });
          }} /></SettingsControlSlot>
      </SettingsRow>
      <SettingsRow controlLayout="inline" title={t('settings.attachments.threshold')} {...(!mobile ? { description: t('settings.attachments.thresholdHint') } : {})}>
        <SettingsControlSlot>{mobile ? <AppButton disabled={busy || !status} size="sm" onClick={() => setEditThreshold(true)}>{status ? t('settings.attachments.thresholdValue', { count: status.observationThreshold }) : '—'}</AppButton> : <AppInput aria-label={t('settings.attachments.threshold')} disabled={busy || !status}
          min={1} placeholder="—" type="number" value={unavailable ? '' : threshold} onChange={(event) => setThreshold(event.target.value)}
          onBlur={() => {
            if (status && Number.isSafeInteger(Number(threshold)) && Number(threshold) > 0) {
              void run({ action: 'configure', settings: { automatic: status.automatic, observationThreshold: Number(threshold) } });
            } else setThreshold(String(status?.observationThreshold ?? 30));
          }} />}</SettingsControlSlot>
      </SettingsRow>
      <SettingsRow controlLayout="inline" title={t('settings.attachments.used')} description={status ? bytes(status.usedBytes) : '—'}>
        {!mobile ? <SettingsControlSlot><AppButton disabled={busy || unavailable} onClick={() => void run({ action: 'status' })} size="sm">
          {t('settings.attachments.refresh')}
        </AppButton></SettingsControlSlot> : null}
      </SettingsRow>
      <SettingsRow controlLayout={mobile ? 'inline' : 'stacked'} title={t('settings.attachments.eligible')}
        description={status ? `${bytes(status.eligibleBytes)} · ${t('settings.attachments.eligibleHint')}` : '—'}>
        <SettingsControlSlot><AppButton disabled={busy || !status} onClick={() => void run({ action: 'clean' })} size="sm">
          {t('settings.attachments.clean')}
        </AppButton></SettingsControlSlot>
      </SettingsRow>
      <SettingsRow title={t('settings.attachments.trash')}
        description={status ? `${bytes(status.trashBytes)} · ${t('settings.attachments.trashHint')}` : '—'}>
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
      <AttachmentCleanupThresholdDialog open={editThreshold} value={status?.observationThreshold ?? 30}
        onOpenChange={setEditThreshold} onSave={observationThreshold => {
          setEditThreshold(false);
          if (status) void run({ action: 'configure', settings: { automatic: status.automatic, observationThreshold } });
        }} />
      <EmptyAttachmentTrashDialog busy={busy} open={confirmEmpty} size={bytes(status?.trashBytes ?? 0)}
        onOpenChange={setConfirmEmpty} onConfirm={() => { setConfirmEmpty(false); void run({ action: 'empty-trash' }); }} />
    </SettingsSection>
  );
}

function EmptyAttachmentTrashDialog({ busy, open, size, onOpenChange, onConfirm }: {
  busy: boolean; open: boolean; size: string; onOpenChange: (open: boolean) => void; onConfirm: () => void;
}) {
  const t = useTranslation();
  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogPortal><AppDialogOverlay /><AppDialogContent layout="task" className="w-[calc(100vw-3rem)] max-w-[420px]">
        <AppDialogTitle>{t('settings.attachments.emptyTitle')}</AppDialogTitle>
        <AppDialogBody><AppDialogDescription>{t('settings.attachments.emptyHint', { size })}</AppDialogDescription></AppDialogBody>
        <AppDialogActions>
          <AppButton onClick={() => onOpenChange(false)}>{t('common.cancel')}</AppButton>
          <AppButton disabled={busy} onClick={onConfirm}>{t('settings.attachments.empty')}</AppButton>
        </AppDialogActions>
      </AppDialogContent></AppDialogPortal>
    </AppDialog>
  );
}

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
