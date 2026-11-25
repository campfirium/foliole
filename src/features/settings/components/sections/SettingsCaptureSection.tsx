import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { formatShortcutSetDisplayLabel } from '../../../../shared/commands/shortcutDisplay';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadDesktopHostCapabilities,
  openGlobalCaptureAccessibilitySettings,
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
  settingsButtonClassName,
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

function CapturePermissionRow({ permission }: { permission: DesktopHostCapabilities['globalCapturePermission'] }) {
  const t = useTranslation();
  const [openFailed, setOpenFailed] = useState(false);
  if (permission === 'notRequired') return null;
  const denied = permission === 'denied';
  const status = permission === 'granted' ? t('settings.capture.accessibility.authorized')
    : denied ? t('settings.capture.accessibility.unauthorized') : t('settings.capture.permission.unavailable');
  const openSettings = () => {
    setOpenFailed(false);
    void openGlobalCaptureAccessibilitySettings().catch(() => setOpenFailed(true));
  };
  return (
    <SettingsRow
      description={<><span aria-live="polite">{status}</span>{denied && openFailed ? (
        <span className="block" role="alert">{t('settings.capture.accessibility.openFailed')}</span>
      ) : null}</>}
      readonly={!denied}
      title={t('settings.capture.accessibility.title')}
    >
      {denied ? (
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button className={settingsButtonClassName()} onClick={openSettings} type="button">
            {t('settings.capture.accessibility.openSettings')}
          </button>
        </SettingsControlSlot>
      ) : null}
    </SettingsRow>
  );
}

function useCaptureHostCapabilities() {
  const [capabilities, setCapabilities] = useState<DesktopHostCapabilities | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    let request = 0;
    const refresh = () => {
      const current = ++request;
      void loadDesktopHostCapabilities().then((value) => {
        if (current !== request) return;
        setCapabilities(value);
        setCheckFailed(false);
      }).catch(() => {
        if (current === request) setCheckFailed(true);
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      request += 1;
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return { capabilities, checkFailed };
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
      className={settingsHotkeyChipClassName(
        label ? 'assigned' : 'empty',
        'border-dashed border-settings-control-border bg-transparent hover:border-settings-control-border-hover'
      )}
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
  const { capabilities, checkFailed } = useCaptureHostCapabilities();
  const [position, setPosition] = useState<CaptureToastPosition>(loadToastPosition);

  const updatePosition = (value: string) => {
    const nextPosition = value === 'bottom-right' ? 'bottom-right' : 'top-right';
    setPosition(nextPosition);
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition, nextPosition);
  };

  return (
    <SettingsSection
      actions={capabilities?.globalCaptureSupported ? <CaptureShortcutButton /> : null}
      ariaLabel={t('settings.capture.sectionAria')}
      className="[&_[data-settings-section-header]_p]:max-w-xl"
      description={capabilities?.globalCaptureSupported ? t('settings.capture.sectionDescription')
        : captureAvailabilityDescription(capabilities, checkFailed, t)}
      searchRowId={SETTINGS_CAPTURE_SEARCH_ROW_ID}
      title={t('settings.capture.sectionTitle')}
    >
      {capabilities?.globalCaptureSupported ? (
        <CapturePermissionRow permission={checkFailed && capabilities.globalCapturePermission !== 'notRequired'
          ? 'unavailable' : capabilities.globalCapturePermission} />
      ) : null}
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

function captureAvailabilityDescription(
  capabilities: DesktopHostCapabilities | null, checkFailed: boolean, t: ReturnType<typeof useTranslation>
) {
  if (checkFailed) return t('settings.capture.permission.unavailable');
  return t(capabilities ? 'settings.capture.permission.unsupported' : 'settings.capture.permission.checking');
}
