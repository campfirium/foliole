import { useEffect, useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { loadDesktopHostCapabilities } from '../../../shared/platform/desktopHostCapabilities';
import type { DesktopHostCapabilities } from '../../../shared/platform/desktopHostCapabilities';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';
import {
  settingsFieldClassName,
  settingsHotkeyChipClassName,
  settingsHotkeyRowClassName
} from '../../../shared/ui';
import { settingsSearchRowProps } from '../model/settingsSearch';

import type { HotkeyFilterMode } from './HotkeySettingsSectionModel';

const SEARCHABLE_GLOBAL_CLIP_SHORTCUT_LABELS = 'Alt Shift C Command';

function hotkeyTokensMatch(value: string, query: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const queryTokens = query.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return queryTokens.every((token) => normalized.includes(token));
}

export function shouldShowGlobalClipShortcut(filterMode: HotkeyFilterMode, query: string, t: ReturnType<typeof useTranslation>) {
  if (filterMode === 'unassigned' || filterMode === 'customized') {
    return false;
  }
  if (!query.trim()) {
    return true;
  }
  return hotkeyTokensMatch([
    t('settings.globalClip.shortcut.title'),
    t('settings.globalClip.shortcut.section'),
    SEARCHABLE_GLOBAL_CLIP_SHORTCUT_LABELS
  ].join(' '), query);
}

function useGlobalClipCapabilities() {
  const [capabilities, setCapabilities] = useState<DesktopHostCapabilities | null>(null);
  useEffect(() => {
    let active = true;
    void loadDesktopHostCapabilities().then((value) => {
      if (active) setCapabilities(value);
    });
    return () => { active = false; };
  }, []);
  return capabilities;
}

function GlobalClipStatusRow({ capabilities, t }: {
  capabilities: DesktopHostCapabilities | null;
  t: ReturnType<typeof useTranslation>;
}) {
  const supported = capabilities?.globalCaptureSupported !== false;
  const registered = capabilities?.globalCaptureShortcutRegistered !== false;
  const shortcutLabel = capabilities?.globalCaptureShortcutLabel;
  const available = supported && registered && Boolean(shortcutLabel);
  const permission = capabilities?.globalCapturePermission;
  const permissionText = permission === 'granted'
    ? t('settings.globalClip.permission.granted')
    : permission === 'denied'
      ? t('settings.globalClip.permission.denied')
      : permission === 'unavailable'
        ? t('settings.globalClip.permission.unavailable')
        : null;
  return (
    <div
      {...settingsSearchRowProps({
        categoryId: 'hotkeys',
        description: t('settings.globalClip.shortcut.description'),
        id: 'hotkeys-global-clip-shortcut',
        title: t('settings.globalClip.shortcut.title')
      })}
      className={settingsHotkeyRowClassName()}
      role="listitem"
    >
      <div className="min-w-0">
        <div className="truncate text-[0.95rem] text-foreground">{t('settings.globalClip.shortcut.title')}</div>
        <div className="mt-0.5 text-sm text-foreground/55">
          {!supported
            ? t('settings.globalClip.shortcut.unsupported')
            : registered ? t('settings.globalClip.shortcut.section') : t('settings.globalClip.shortcut.registrationFailed')}
        </div>
        {supported && permissionText ? <div className="mt-0.5 text-sm text-foreground/55">{permissionText}</div> : null}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <span className={settingsHotkeyChipClassName(available ? 'assigned' : 'empty')}>
          <span className="min-w-0 truncate">
            {available ? shortcutLabel : t('settings.globalClip.shortcut.unavailable')}
          </span>
        </span>
      </div>
    </div>
  );
}

function GlobalClipToastPositionRow({ t }: { t: ReturnType<typeof useTranslation> }) {
  const [position, setPosition] = useState(() => (
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition) === 'bottom-right'
      ? 'bottom-right'
      : 'top-right'
  ));
  const updatePosition = (value: string) => {
    const nextValue = value === 'bottom-right' ? 'bottom-right' : 'top-right';
    setPosition(nextValue);
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition, nextValue);
  };
  return (
    <div
      {...settingsSearchRowProps({
        categoryId: 'hotkeys',
        description: t('settings.globalClip.toastPosition.description'),
        id: 'hotkeys-global-clip-toast-position',
        title: t('settings.globalClip.toastPosition.title')
      })}
      className={settingsHotkeyRowClassName()}
      role="listitem"
    >
      <div className="min-w-0">
        <div className="truncate text-[0.95rem] text-foreground">{t('settings.globalClip.toastPosition.title')}</div>
        <div className="mt-0.5 text-sm text-foreground/55">{t('settings.globalClip.toastPosition.description')}</div>
      </div>
      <select
        aria-label={t('settings.globalClip.toastPosition.title')}
        className={settingsFieldClassName('w-32')}
        onChange={(event) => updatePosition(event.target.value)}
        value={position}
      >
        <option value="top-right">{t('settings.globalClip.toastPosition.topRight')}</option>
        <option value="bottom-right">{t('settings.globalClip.toastPosition.bottomRight')}</option>
      </select>
    </div>
  );
}

export function GlobalClipShortcutRow() {
  const t = useTranslation();
  const capabilities = useGlobalClipCapabilities();
  return (
    <>
      <GlobalClipStatusRow capabilities={capabilities} t={t} />
      {capabilities?.globalCaptureToastPositionSupported ? <GlobalClipToastPositionRow t={t} /> : null}
    </>
  );
}
