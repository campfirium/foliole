import { useState } from 'react';

import type { AttachmentMaintenanceStatus } from '../../../../../lib/platform/attachmentMaintenanceContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppInput, AppSwitch, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import { AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../../shared/ui/Dialog';
import { SettingsTouchSheet, SettingsTouchSheetOverlay } from '../../../../shared/ui/SettingsTouchSheet';
import { SettingsValueRow } from '../../../../shared/ui/SettingsValueRow';

import { AttachmentCleanupThresholdDialog } from './AttachmentCleanupThresholdDialog';
import { useAttachmentStorageSettings } from './useAttachmentStorageSettings';

export function SettingsAttachmentStorageSection({ unavailable = false, mobile = false }: { unavailable?: boolean; mobile?: boolean }) {
  const t = useTranslation();
  const { status, threshold, setThreshold, busy, error, run } = useAttachmentStorageSettings();
  const [editThreshold, setEditThreshold] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  if (!status && !error && !unavailable) return null;
  return (
    <>
    <SettingsSection ariaLabel={t('settings.attachments.title')} {...(!mobile ? { title: t('settings.attachments.title') } : {})}>
      {error ? <p role="alert">{t('settings.attachments.error')}</p> : null}
      <SettingsRow controlLayout="inline" title={t('settings.attachments.automatic')} description={t('settings.attachments.automaticHint')}>
        <SettingsControlSlot><AppSwitch aria-label={t('settings.attachments.automatic')} checked={status?.automatic ?? false}
          disabled={busy || !status} onCheckedChange={(automatic) => {
            if (status) void run({ action: 'configure', settings: { automatic, observationThreshold: status.observationThreshold } });
          }} /></SettingsControlSlot>
      </SettingsRow>
      {mobile ? <SettingsValueRow title={t('settings.attachments.threshold')} value={status ? t('settings.attachments.thresholdValue', { count: status.observationThreshold }) : '—'} disabled={busy || !status} onClick={() => setEditThreshold(true)} /> : <SettingsRow controlLayout="inline" title={t('settings.attachments.threshold')} {...(!mobile ? { description: t('settings.attachments.thresholdHint') } : {})}>
        <SettingsControlSlot><AppInput aria-label={t('settings.attachments.threshold')} disabled={busy || !status}
          min={1} placeholder="—" type="number" value={unavailable ? '' : threshold} onChange={(event) => setThreshold(event.target.value)}
          onBlur={() => {
            if (status && Number.isSafeInteger(Number(threshold)) && Number(threshold) > 0) {
              void run({ action: 'configure', settings: { automatic: status.automatic, observationThreshold: Number(threshold) } });
            } else setThreshold(String(status?.observationThreshold ?? 30));
          }} /></SettingsControlSlot>
      </SettingsRow>}
      <SettingsRow controlLayout="inline" title={t('settings.attachments.used')} {...(!mobile ? { description: status ? bytes(status.usedBytes) : '—' } : {})}>
        {mobile ? <SettingsControlSlot><span data-settings-inline-value>{status ? bytes(status.usedBytes) : '—'}</span></SettingsControlSlot> : <SettingsControlSlot><AppButton disabled={busy || unavailable} onClick={() => void run({ action: 'status' })} size="sm">
          {t('settings.attachments.refresh')}
        </AppButton></SettingsControlSlot>}
      </SettingsRow>
      <SettingsRow controlLayout={mobile ? 'inline' : 'stacked'} title={t('settings.attachments.eligible')}
        description={status ? `${bytes(status.eligibleBytes)} · ${t('settings.attachments.eligibleHint')}` : '—'}>
        <SettingsControlSlot><AppButton disabled={busy || !status || (mobile && status.eligibleBytes === 0)} onClick={() => void run({ action: 'clean' })} size="sm">
          {t('settings.attachments.clean')}
        </AppButton></SettingsControlSlot>
      </SettingsRow>
      <AttachmentTrashRow mobile={mobile} status={status} busy={busy} onEmpty={() => setConfirmEmpty(true)}
        onRestore={() => void run({ action: 'restore', storageKeys: status?.trash.map(file => file.storageKey) ?? [] })} />
      <AttachmentCleanupThresholdDialog open={editThreshold} value={status?.observationThreshold ?? 30}
        onOpenChange={setEditThreshold} onSave={observationThreshold => {
          setEditThreshold(false);
          if (status) void run({ action: 'configure', settings: { automatic: status.automatic, observationThreshold } });
        }} />
      <EmptyAttachmentTrashDialog mobile={mobile} busy={busy} open={confirmEmpty} size={bytes(status?.trashBytes ?? 0)}
        onOpenChange={setConfirmEmpty} onConfirm={() => { setConfirmEmpty(false); void run({ action: 'empty-trash' }); }} />
    </SettingsSection>
    </>
  );
}

function AttachmentTrashRow({ mobile, status, busy, onRestore, onEmpty }: {
  mobile: boolean; status: AttachmentMaintenanceStatus | null; busy: boolean; onRestore(): void; onEmpty(): void;
}) {
  const t = useTranslation();
  const controls = <SettingsControlSlot>
    <AppButton disabled={busy || !status?.trash.length} size="sm" onClick={onRestore}>{t('settings.attachments.restore')}</AppButton>
    <AppButton aria-label={t('settings.attachments.empty')} disabled={busy || !status?.trash.length} size="sm" onClick={onEmpty}>{t('settings.attachments.empty')}</AppButton>
  </SettingsControlSlot>;
  if (!mobile) return <SettingsRow title={t('settings.attachments.trash')}
    description={status ? `${bytes(status.trashBytes)} · ${t('settings.attachments.trashHint')}` : '—'}>{controls}</SettingsRow>;
  return <div data-settings-row data-settings-trash-row>
    <div data-settings-summary><h4>{t('settings.attachments.trash')}</h4><span data-settings-inline-value>{status ? bytes(status.trashBytes) : '—'}</span></div>
    <p>{t('settings.attachments.trashHint')}</p>
    <div data-settings-trash-actions>{controls}</div>
  </div>;
}

function EmptyAttachmentTrashDialog({ mobile, busy, open, size, onOpenChange, onConfirm }: {
  mobile: boolean; busy: boolean; open: boolean; size: string; onOpenChange: (open: boolean) => void; onConfirm: () => void;
}) {
  const t = useTranslation();
  const Content = mobile ? SettingsTouchSheet : AppDialogContent;
  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogPortal>{mobile ? <SettingsTouchSheetOverlay /> : <AppDialogOverlay />}<Content {...(!mobile ? { layout: 'task' as const, className: 'w-[calc(100vw-3rem)] max-w-[420px]' } : {})}>
        <div data-settings-sheet-header><AppDialogTitle>{t('settings.attachments.emptyTitle')}</AppDialogTitle></div>
        <AppDialogBody><AppDialogDescription>{t('settings.attachments.emptyHint', { size })}</AppDialogDescription></AppDialogBody>
        <AppDialogActions>
          <AppButton onClick={() => onOpenChange(false)}>{t('common.cancel')}</AppButton>
          <AppButton variant={mobile ? 'danger' : 'default'} disabled={busy} onClick={onConfirm}>{t('settings.attachments.empty')}</AppButton>
        </AppDialogActions>
      </Content></AppDialogPortal>
    </AppDialog>
  );
}

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
