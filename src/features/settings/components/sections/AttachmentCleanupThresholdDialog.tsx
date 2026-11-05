import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppInput } from '../../../../shared/ui';
import { AppDialog, AppDialogActions, AppDialogBody, AppDialogDescription, AppDialogPortal, AppDialogTitle } from '../../../../shared/ui/Dialog';
import { SettingsTouchSheet, SettingsTouchSheetOverlay } from '../../../../shared/ui/SettingsTouchSheet';

export function AttachmentCleanupThresholdDialog({ open, value, onOpenChange, onSave }: {
  open: boolean; value: number; onOpenChange(open: boolean): void; onSave(value: number): void;
}) {
  const t = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { if (open) { setDraft(String(value)); setInvalid(false); } }, [open, value]);
  return <AppDialog open={open} onOpenChange={onOpenChange}>
    <AppDialogPortal><SettingsTouchSheetOverlay /><SettingsTouchSheet onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); input.current?.select(); }}>
      <form onSubmit={event => {
        event.preventDefault();
        const parsed = Number(draft);
        if (!/^\d+$/.test(draft.trim()) || !Number.isSafeInteger(parsed) || parsed < 1) return setInvalid(true);
        onSave(parsed);
      }}>
        <div data-settings-sheet-header><AppDialogTitle>{t('settings.attachments.threshold')}</AppDialogTitle></div>
        <AppDialogBody>
          <AppDialogDescription>{t('settings.attachments.thresholdHint')}</AppDialogDescription>
          <div data-settings-sheet-number><AppInput ref={input} aria-label={t('settings.attachments.threshold')} aria-invalid={invalid}
            inputMode="numeric" value={draft} onChange={event => { setDraft(event.target.value); setInvalid(false); }} /><span>{t('settings.attachments.daysUnit')}</span></div>
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
