import { useEffect, useRef, useState } from 'react';

import type { DesktopReminderNotificationStatus } from '../../../../../lib/platform/nativeReminderContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { getDesktopReminderRepository } from '../../../../shared/platform/desktop/desktopReminderRepository';
import { AppButton, SettingsRow } from '../../../../shared/ui';

export function useDesktopReminderNotificationPermission() {
  const [status, setStatus] = useState<DesktopReminderNotificationStatus>();
  const [requesting, setRequesting] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const refresh = () => {
      if (pending.current) return;
      const request = ++generation.current;
      void getDesktopReminderRepository()?.notificationStatus().then(
        value => { if (request === generation.current) setStatus(value); },
        () => { if (request === generation.current) setStatus('unavailable'); }
      );
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      ++generation.current;
      window.removeEventListener('focus', refresh);
    };
  }, []);

  function requestPermission() {
    if (pending.current || (status && status !== 'notDetermined')) return;
    const repository = getDesktopReminderRepository();
    if (!repository) return;

    const request = ++generation.current;
    pending.current = true;
    setRequesting(true);
    void repository.requestNotificationPermission().then(
      value => { if (request === generation.current) setStatus(value); },
      () => { if (request === generation.current) setStatus('unavailable'); }
    ).finally(() => {
      pending.current = false;
      if (request === generation.current) setRequesting(false);
    });
  }
  return { status, requesting, requestPermission };
}

export function DesktopReminderNotificationNotice({ status, requesting, requestPermission }: {
  status: DesktopReminderNotificationStatus | undefined;
  requesting: boolean;
  requestPermission: () => void;
}) {
  const t = useTranslation();
  const [openFailed, setOpenFailed] = useState(false);
  const canRequest = status === 'notDetermined';
  if (!canRequest && status !== 'denied' && status !== 'unavailable') return null;

  const title = canRequest ? 'settings.reminders.notificationsNotDetermined'
    : status === 'denied' ? 'settings.reminders.notificationsOff' : 'settings.reminders.notificationStatusUnavailable';
  return <SettingsRow title={t(title)}
    description={!canRequest && openFailed ? t('settings.reminders.openNotificationSettingsFailed') : undefined}>
    {canRequest ? <AppButton loading={requesting} onClick={requestPermission}>
      {t('settings.reminders.allowNotifications')}
    </AppButton> : <AppButton onClick={() => {
      setOpenFailed(false);
      void getDesktopReminderRepository()?.openNotificationSettings().catch(() => setOpenFailed(true));
    }}>
      {t('settings.reminders.openNotificationSettings')}
    </AppButton>}
  </SettingsRow>;
}
