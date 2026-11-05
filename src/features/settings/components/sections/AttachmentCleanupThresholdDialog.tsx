import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppInput } from '../../../../shared/ui';
import { AppDialog, AppDialogActions, AppDialogBody, AppDialogDescription, AppDialogPortal, AppDialogTitle } from '../../../../shared/ui/Dialog';
import { SettingsTouchSheet, SettingsTouchSheetOverlay } from '../../../../shared/ui/SettingsTouchSheet';

const DAY_CHOICES = [7, 14, 30, 60, 90];

export function AttachmentCleanupThresholdDialog({ open, value, onOpenChange, onSave }: {
  open: boolean; value: number; onOpenChange(open: boolean): void; onSave(value: number): void;
}) {
  const t = useTranslation();
  const [draft, setDraft] = useState(String(value));
  const [custom, setCustom] = useState(!DAY_CHOICES.includes(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (open) { setDraft(String(value)); setCustom(!DAY_CHOICES.includes(value)); setInvalid(false); }
  }, [open, value]);
  return <AppDialog open={open} onOpenChange={onOpenChange}>
    <AppDialogPortal><SettingsTouchSheetOverlay /><SettingsTouchSheet>
      <form onSubmit={event => {
        event.preventDefault();
        const parsed = Number(draft);
        if (!/^\d+$/.test(draft.trim()) || !Number.isSafeInteger(parsed) || parsed < 1) return setInvalid(true);
        onSave(parsed);
      }}>
        <div data-settings-sheet-header><AppDialogTitle>{t('settings.attachments.threshold')}</AppDialogTitle></div>
        <AppDialogBody>
          <AppDialogDescription>{t('settings.attachments.thresholdHint')}</AppDialogDescription>
          <div data-settings-sheet-choices role="radiogroup" aria-label={t('settings.attachments.threshold')}>
            {DAY_CHOICES.map(days => <label key={days}>
              <input type="radio" name="attachment-cleanup-days" checked={!custom && Number(draft) === days}
                onChange={() => { setDraft(String(days)); setCustom(false); setInvalid(false); }} />
              <span>{t('settings.attachments.thresholdValue', { count: days })}</span>
            </label>)}
            <label><input type="radio" name="attachment-cleanup-days" checked={custom}
              onChange={() => { setCustom(true); setInvalid(false); }} /><span>{t('settings.attachments.thresholdCustom')}</span></label>
          </div>
          {custom ? <div data-settings-sheet-number><AppInput aria-label={t('settings.attachments.threshold')} aria-invalid={invalid}
            inputMode="numeric" value={draft} onChange={event => { setDraft(event.target.value); setInvalid(false); }} /><span>{t('settings.attachments.daysUnit')}</span></div> : null}
          {invalid ? <p role="alert">{t('settings.attachments.thresholdInvalid')}</p> : null}
        </AppDialogBody>
        <AppDialogActions>
          <AppButton type="button" onClick={() => onOpenChange(false)}>{t('common.cancel')}</AppButton>
          <AppButton type="submit">{t('common.done')}</AppButton>
        </AppDialogActions>
      </form>
    </SettingsTouchSheet></AppDialogPortal>
  </AppDialog>;
}
