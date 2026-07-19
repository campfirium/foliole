import { Check, ChevronDown, LoaderCircle, Search } from 'lucide-react';
import { useId } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SETTINGS_SELECT_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow, settingsFieldClassName } from '../../../../shared/ui';

import { useSettingsFontCombobox, type SettingsFontComboboxProps } from './useSettingsFontCombobox';

export function SettingsFontComboboxRow(props: SettingsFontComboboxProps) {
  const t = useTranslation();
  const listId = useId();
  const loadingId = useId();
  const state = useSettingsFontCombobox(props);
  const selectedLabel = props.options.find((option) => option.value === props.value)?.label ?? props.value;

  return (
    <SettingsRow description={props.description} title={props.label}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="relative" ref={state.rootRef}>
          <button aria-controls={listId} aria-expanded={state.open} aria-haspopup="listbox" aria-label={props.ariaLabel} className={settingsFieldClassName(`${SETTINGS_SELECT_WIDTH_CLASS_NAME} inline-flex items-center justify-between gap-2`)} onClick={() => state.open ? state.setOpen(false) : state.show()} onKeyDown={(event) => { if (!state.open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) { event.preventDefault(); state.show(); } }} role="combobox" type="button">
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown aria-hidden="true" className="shrink-0" size={15} />
          </button>
          {state.open ? (
            <div className="absolute right-0 z-panel-popover mt-1 w-[300px] rounded-lg border border-settings-divider bg-popover p-1 shadow-popover">
              <label className="flex items-center gap-2 border-b border-settings-divider px-2 py-1.5">
                <Search aria-hidden="true" size={14} />
                <input aria-controls={listId} aria-label={t('settings.appearance.fontCatalog.search')} className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => { state.setQuery(event.target.value); state.setActiveIndex(0); }} onKeyDown={state.onInputKeyDown} placeholder={t('settings.appearance.fontCatalog.search')} ref={state.inputRef} value={state.query} />
              </label>
              <div aria-busy={props.loading} className="max-h-[340px] overflow-y-auto py-1" id={listId} role="listbox">
                {state.filtered.map((option, index) => (
                  <button aria-selected={option.value === props.value} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${index === state.activeIndex ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.04]'}`} key={option.value} onMouseEnter={() => state.setActiveIndex(index)} onClick={() => state.choose(option.value)} role="option" type="button">
                    <Check aria-hidden="true" className={option.value === props.value ? 'opacity-100' : 'opacity-0'} size={14} />
                    <span className="truncate">{option.label}</span>
                  </button>
                ))}
                {props.loading ? (
                  <div className="space-y-2 px-2 py-2 text-foreground/55" role="status">
                    <div className="flex items-center gap-2 text-sm">
                      <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
                      <span id={loadingId}>{t('settings.appearance.fontCatalog.loading')}</span>
                    </div>
                    <div aria-labelledby={loadingId} className="h-1 overflow-hidden rounded-full bg-foreground/[0.06]" role="progressbar">
                      <div className="h-full w-1/2 animate-pulse rounded-full bg-foreground/30" />
                    </div>
                  </div>
                ) : null}
                {!props.loading && state.filtered.length === 0 ? <p className="px-2 py-2 text-sm text-foreground/55">{t('settings.appearance.fontCatalog.empty')}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
