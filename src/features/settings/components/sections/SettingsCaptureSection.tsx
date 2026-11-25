import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { formatShortcutSetDisplayLabel } from '../../../../shared/commands/shortcutDisplay';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadDesktopHostCapabilities,
  type DesktopHostCapabilities
} from '../../../../shared/platform/desktopHostCapabilities';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName,
  settingsHotkeyChipClassName
} from '../../../../shared/ui';
import { useCommandShortcutMap, useHotkeySettings } from '../../context/HotkeySettingsProvider';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { SETTINGS_CAPTURE_POSITION_SEARCH_ROW_ID, SETTINGS_CAPTURE_SEARCH_ROW_ID } from '../../model/settingsSearchRowCatalog';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

type CaptureToastPosition = 'bottom-right' | 'top-right';

function loadToastPosition(): CaptureToastPosition {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition) === 'bottom-right'
    ? 'bottom-right'
    : 'top-right';
}

function permissionDescription(capabilities: DesktopHostCapabilities | null, t: ReturnType<typeof useTranslation>) {
  if (!capabilities) return t('settings.capture.permission.checking');
  if (capabilities.globalCaptureSupported === false) return t('settings.capture.permission.unsupported');
  if (capabilities.globalCapturePermission === 'granted') return t('settings.capture.permission.granted');
  if (capabilities.globalCapturePermission === 'denied') return t('settings.capture.permission.denied');
  if (capabilities.globalCapturePermission === 'unavailable') return t('settings.capture.permission.unavailable');
  return t('settings.capture.permission.notRequired');
}

function CaptureShortcutButton() {
  const t = useTranslation();
  const { hotkeyItems, onConfigureShortcut } = useHotkeySettings();
  const shortcuts = useCommandShortcutMap();
  const commandId = APP_COMMAND_IDS.globalCaptureToInbox;
  const item = hotkeyItems.find((candidate) => candidate.commandId === commandId);
  if (!item) return null;

  const label = formatShortcutSetDisplayLabel(shortcuts[commandId]);
  const displayLabel = label || t('settings.hotkeys.filter.unassigned');
  const actionLabel = t('desktop.palette.command.configureShortcut', { title: item.title });
  return (
    <button
      aria-label={`${actionLabel} (${displayLabel})`}
      className={settingsHotkeyChipClassName(label ? 'assigned' : 'empty')}
      onClick={() => onConfigureShortcut(commandId)}
      title={actionLabel}
      type="button"
    >
      <span className="min-w-0 truncate">{displayLabel}</span>
      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
    </button>
  );
}

export function SettingsCaptureSection() {
  const t = useTranslation();
  const positionRow = useLocalizedSettingsSearchRow(SETTINGS_CAPTURE_POSITION_SEARCH_ROW_ID);
  const [capabilities, setCapabilities] = useState<DesktopHostCapabilities | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [position, setPosition] = useState<CaptureToastPosition>(loadToastPosition);

  useEffect(() => {
    let active = true;
    void loadDesktopHostCapabilities().then((value) => {
      if (active) setCapabilities(value);
    }).catch(() => {
      if (active) setCheckFailed(true);
    });
    return () => { active = false; };
  }, []);

  const updatePosition = (value: string) => {
    const nextPosition = value === 'bottom-right' ? 'bottom-right' : 'top-right';
    setPosition(nextPosition);
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition, nextPosition);
  };

  return (
    <SettingsSection
      ariaLabel={t('settings.capture.sectionAria')}
      searchRowId={SETTINGS_CAPTURE_SEARCH_ROW_ID}
      title={t('settings.capture.sectionTitle')}
      titleActions={capabilities?.globalCaptureSupported ? <CaptureShortcutButton /> : null}
    >
      <SettingsRow
        description={checkFailed ? t('settings.capture.permission.unavailable') : permissionDescription(capabilities, t)}
        readonly
        title={t('settings.capture.permission.title')}
      />
      {capabilities?.globalCaptureToastPositionSupported ? (
        <SettingsRow
          description={positionRow.description}
          {...settingsSearchRowProps(positionRow)}
          title={positionRow.title}
        >
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <select
              aria-label={positionRow.title}
              className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
              onChange={(event) => updatePosition(event.target.value)}
              value={position}
            >
              <option value="top-right">{t('settings.capture.position.topRight')}</option>
              <option value="bottom-right">{t('settings.capture.position.bottomRight')}</option>
            </select>
          </SettingsControlSlot>
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}
