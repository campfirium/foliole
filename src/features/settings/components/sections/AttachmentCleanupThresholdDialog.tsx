import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppInput } from '../../../../shared/ui';
import { AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../../shared/ui/Dialog';

export function AttachmentCleanupThresholdDialog({ open, value, onOpenChange, onSave }: {
  open: boolean; value: number; onOpenChange(open: boolean): void; onSave(value: number): void;
}) {
  const t = useTranslation();
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { if (open) { setDraft(String(value)); setInvalid(false); } }, [open, value]);
  return <AppDialog open={open} onOpenChange={onOpenChange}>
    <AppDialogPortal><AppDialogOverlay /><AppDialogContent layout="task" className="w-[calc(100vw-3rem)] max-w-[420px]">
      <form onSubmit={event => {
        event.preventDefault();
        const parsed = Number(draft);
        if (!/^\d+$/.test(draft.trim()) || !Number.isSafeInteger(parsed) || parsed < 1) return setInvalid(true);
        onSave(parsed);
      }}>
        <AppDialogTitle>{t('settings.attachments.threshold')}</AppDialogTitle>
        <AppDialogBody>
          <AppDialogDescription>{t('settings.attachments.thresholdHint')}</AppDialogDescription>
          <AppInput className="mt-4" aria-label={t('settings.attachments.threshold')} aria-invalid={invalid}
            inputMode="numeric" value={draft} onChange={event => { setDraft(event.target.value); setInvalid(false); }} />
          {invalid ? <p role="alert">{t('settings.attachments.thresholdInvalid')}</p> : null}
        </AppDialogBody>
        <AppDialogActions>
          <AppButton type="button" onClick={() => onOpenChange(false)}>{t('common.cancel')}</AppButton>
          <AppButton type="submit">{t('common.done')}</AppButton>
        </AppDialogActions>
      </form>
    </AppDialogContent></AppDialogPortal>
  </AppDialog>;
}
