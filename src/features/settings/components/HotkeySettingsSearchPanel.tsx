import { Check, Keyboard, ListFilter, Search } from 'lucide-react';
import { useState } from 'react';

import { cn } from '../../../shared/lib/utils';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  appFloatingSurfaceClassName,
  settingsHotkeySearchFieldClassName,
  settingsHotkeySearchPanelClassName,
  settingsResetButtonClassName
} from '../../../shared/ui';

import { HOTKEY_FILTER_OPTIONS } from './HotkeySettingsFilterOptions';
import type { HotkeyFilterMode } from './HotkeySettingsSectionModel';

const HOTKEY_ICON_BUTTON_CLASS_NAME = settingsResetButtonClassName('size-8');
const HOTKEY_FILTER_ITEM_CLASS_NAME = 'flex min-h-9 w-full items-center justify-between gap-4 px-3 text-left text-sm font-semibold hover:bg-settings-control-hover';

function HotkeyFilterMenu(props: {
  filterMode: HotkeyFilterMode;
  onFilterModeChange: (nextMode: HotkeyFilterMode) => void;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const activeOption = HOTKEY_FILTER_OPTIONS.find((option) => option.value === props.filterMode);
  const activeLabel = activeOption ? t(activeOption.labelKey) : t('settings.hotkeys.filter.all');
  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label={t('settings.hotkeys.filter.aria', { label: activeLabel })}
        className={HOTKEY_ICON_BUTTON_CLASS_NAME}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ListFilter aria-hidden="true" size={17} strokeWidth={1.9} />
      </button>
      {open ? (
        <div className={cn(appFloatingSurfaceClassName('popover'), 'absolute left-0 top-10 z-floating min-w-44 overflow-hidden p-1')} role="menu">
          {HOTKEY_FILTER_OPTIONS.map((option) => (
            <button
              className={HOTKEY_FILTER_ITEM_CLASS_NAME}
              key={option.value}
              onClick={() => {
                props.onFilterModeChange(option.value);
                setOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              {t(option.labelKey)}
              {props.filterMode === option.value ? <Check aria-hidden="true" size={15} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HotkeySearchPanel(props: {
  count: number;
  filterMode: HotkeyFilterMode;
  onBeginSearchRecording: () => void;
  onFilterModeChange: (nextMode: HotkeyFilterMode) => void;
  onQueryChange: (nextQuery: string) => void;
  query: string;
  searchRecording: boolean;
}) {
  const t = useTranslation();

  return (
    <div className={settingsHotkeySearchPanelClassName('flex items-start justify-between gap-6')}>
      <div className="min-w-0">
        <h4 className="text-[0.95rem] font-normal text-foreground">{t('settings.hotkeys.search.title')}</h4>
        <p className="mt-0.5 text-sm text-foreground/60">{t('settings.hotkeys.search.count', { count: props.count })}</p>
      </div>
      <div className="flex min-w-0 items-center gap-4">
        <HotkeyFilterMenu filterMode={props.filterMode} onFilterModeChange={props.onFilterModeChange} />
        <div className="relative w-[216px] max-w-[28vw] min-w-0">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-settings-icon" size={22} strokeWidth={1.9} />
          <input
            aria-label={t('settings.hotkeys.search.input')}
            className={settingsHotkeySearchFieldClassName('h-12 rounded-lg pl-12 pr-12 text-[1.05rem] placeholder:text-foreground/40')}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={props.searchRecording ? t('settings.hotkeys.search.recordingPlaceholder') : t('settings.hotkeys.search.placeholder')}
            type="search"
            value={props.query}
          />
          <button
            aria-label={t('settings.hotkeys.searchByHotkey')}
            className={cn(HOTKEY_ICON_BUTTON_CLASS_NAME, 'absolute right-1.5 top-1/2 -translate-y-1/2')}
            onClick={props.onBeginSearchRecording}
            type="button"
          >
            <Keyboard aria-hidden="true" size={21} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </div>
  );
}
