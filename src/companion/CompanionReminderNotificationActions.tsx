import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { ReminderSnoozeChoice } from '../shared/platform/companion/settings/companionReminderActions';
import {
  AppButton, AppDialog, AppDialogContent, AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../shared/ui';

import { useCompanionReminderNavigation } from './useCompanionReminderNavigation';

export function CompanionReminderNotificationActions({ openFlow }: { openFlow: () => void }) {
  const [choice, setChoice] = useState<ReminderSnoozeChoice>();
  useCompanionReminderNavigation(openFlow, setChoice);
  return choice && <ReminderSnoozeDialog choice={choice} close={() => setChoice(current => (
    current === choice ? undefined : current
  ))} />;
}

function ReminderSnoozeDialog({ choice, close }: { choice: ReminderSnoozeChoice; close: () => void }) {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function snooze(minutes: 30 | 60) {
    setBusy(true);
    setFailed(false);
    try {
      await choice.snooze(minutes);
      close();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <AppDialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <AppDialogPortal>
      <AppDialogOverlay />
      <AppDialogContent className="max-h-[80dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto p-5">
        <AppDialogTitle>{t('settings.reminders.snooze')}</AppDialogTitle>
        <AppDialogDescription className="line-clamp-2 break-words">{choice.message}</AppDialogDescription>
        {failed && <p role="alert">{t('settings.reminders.snoozeFailed')}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <AppButton className="min-h-11 whitespace-normal" disabled={busy} onClick={() => void snooze(30)}>
            {t('settings.reminders.snooze30')}
          </AppButton>
          <AppButton className="min-h-11 whitespace-normal" disabled={busy} onClick={() => void snooze(60)}>
            {t('settings.reminders.snooze60')}
          </AppButton>
        </div>
        <AppButton className="mt-2 min-h-11" variant="ghost" disabled={busy} onClick={close}>{t('common.cancel')}</AppButton>
      </AppDialogContent>
    </AppDialogPortal>
  </AppDialog>;
}
