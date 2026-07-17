import { useCallback, useEffect, useMemo, useState } from 'react';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { loadDesktopHostCapabilities } from '../../../shared/platform/desktopHostCapabilities';
import { RUNTIME_APP_SETTINGS_SAVED_EVENT } from '../../../shared/platform/storage';
import type { HotkeySettingItem } from '../model/hotkeySettings';

function useGlobalCaptureAvailability() {
  const [unavailable, setUnavailable] = useState(false);
  const refresh = useCallback(() => {
    void loadDesktopHostCapabilities().then((capabilities) => {
      setUnavailable(capabilities.globalCaptureSupported && !capabilities.globalCaptureShortcutRegistered);
    });
  }, []);

  useEffect(() => {
    refresh();
    const handleVisibility = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener(RUNTIME_APP_SETTINGS_SAVED_EVENT, refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(RUNTIME_APP_SETTINGS_SAVED_EVENT, refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);
  return unavailable;
}

export function useGlobalCaptureHotkeyItems(items: HotkeySettingItem[]) {
  const t = useTranslation();
  const unavailable = useGlobalCaptureAvailability();
  return useMemo(() => items.map((item) => item.commandId === APP_COMMAND_IDS.globalCaptureToInbox && unavailable
    ? { ...item, conflictMessage: t('settings.hotkeys.unavailable'), conflictSeverity: 'warning' as const }
    : item), [items, t, unavailable]);
}
