import { useEffect, useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { loadDesktopHostCapabilities } from '../../../shared/platform/desktopHostCapabilities';
import {
  settingsHotkeyChipClassName,
  settingsHotkeyRowClassName
} from '../../../shared/ui';
import { settingsSearchRowProps } from '../model/settingsSearch';

import type { HotkeyFilterMode } from './HotkeySettingsSectionModel';

const GLOBAL_CLIP_SHORTCUT_LABEL = 'Alt+Shift+C';

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
    GLOBAL_CLIP_SHORTCUT_LABEL
  ].join(' '), query);
}

export function GlobalClipShortcutRow() {
  const t = useTranslation();
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void loadDesktopHostCapabilities().then((value) => {
      if (active) setSupported(value.globalCaptureSupported);
    });
    return () => { active = false; };
  }, []);
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
        <div className="mt-0.5 truncate text-sm text-foreground/55">
          {supported === false ? t('settings.globalClip.shortcut.unsupported') : t('settings.globalClip.shortcut.section')}
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <span className={settingsHotkeyChipClassName(supported === false ? 'empty' : 'assigned')}>
          <span className="min-w-0 truncate">
            {supported === false ? t('settings.globalClip.shortcut.unavailable') : GLOBAL_CLIP_SHORTCUT_LABEL}
          </span>
        </span>
      </div>
    </div>
  );
}
