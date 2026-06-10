import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppIconButton,
  AppInput,
  LucideCatalogIcon,
  LUCIDE_ICON_OPTIONS,
  settingsIconGridButtonClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import type { HotkeySettingItem } from '../../model/hotkeySettings';

export function matchesIconQuery(values: Array<string | undefined>, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return !normalizedQuery || values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

export function IconGrid(props: {
  icons: typeof LUCIDE_ICON_OPTIONS;
  selectedIconId: string;
  onSelect: (iconId: string) => void;
  compact?: boolean;
}) {
  const t = useTranslation();
  const gridClassName = props.compact
    ? 'grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] justify-items-center gap-1.5'
    : 'grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] justify-items-center gap-2';
  const buttonClassName = (selected: boolean) => settingsIconGridButtonClassName(selected, props.compact ? 'max-w-12' : 'max-w-14');
  return (
    <div className={`app-scrollbar mt-3 overflow-auto pr-2 ${props.compact ? 'max-h-[240px]' : 'max-h-[320px]'}`}>
      <div className={gridClassName}>
        {props.icons.map((icon) => (
          <button
            aria-label={t('settings.icons.picker.useIcon', { label: icon.label })}
            className={buttonClassName(props.selectedIconId === icon.id)}
            key={icon.id}
            onClick={() => props.onSelect(icon.id)}
            title={icon.label}
            type="button"
          >
            <LucideCatalogIcon iconId={icon.id} size={props.compact ? 22 : 28} strokeWidth={1.85} />
          </button>
        ))}
      </div>
      {!props.icons.length ? <p className="px-3 py-3 text-sm text-foreground/60">{t('settings.icons.picker.noMatching')}</p> : null}
    </div>
  );
}

export function IconPicker(props: {
  query: string;
  selectedAction: HotkeySettingItem;
  selectedIconId: string;
  onBack: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (iconId: string) => void;
}) {
  const t = useTranslation();
  const filteredIcons = useMemo(
    () => LUCIDE_ICON_OPTIONS.filter((icon) => matchesIconQuery([icon.id, icon.label], props.query)),
    [props.query]
  );
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <AppIconButton
          className={settingsResetButtonClassName('size-8')}
          icon={<ArrowLeft aria-hidden="true" size={15} />}
          label={t('settings.icons.rail.chooseAnotherAction')}
          onClick={props.onBack}
        />
        <div className="min-w-0 truncate text-[1.02rem] font-semibold text-foreground">{t('settings.icons.rail.chooseIcon')}</div>
      </div>
      <AppInput
        aria-label={t('settings.icons.picker.search')}
        autoFocus
        className="h-9 text-sm"
        onChange={(event) => props.onQueryChange(event.target.value)}
        placeholder={t('settings.icons.picker.searchPlaceholder')}
        value={props.query}
      />
      <IconGrid icons={filteredIcons} selectedIconId={props.selectedIconId} onSelect={props.onSelect} />
    </>
  );
}
