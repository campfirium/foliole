import { useMemo } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppInput } from '../../../../shared/ui';
import type { HotkeySettingItem } from '../../model/hotkeySettings';

function matchesQuery(values: Array<string | undefined>, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return !normalizedQuery || values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function ActionPickerItem(props: {
  item: HotkeySettingItem;
  selectedAction: HotkeySettingItem | null;
  onSelect: (item: HotkeySettingItem) => void;
}) {
  const t = useTranslation();
  return <button
    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
      props.selectedAction?.commandId === props.item.commandId
        ? 'bg-settings-selected text-foreground'
        : 'text-foreground/72 hover:bg-settings-control-hover hover:text-foreground'
    }`}
    onClick={() => props.onSelect(props.item)}
    type="button"
  >
    <span className="min-w-0 truncate font-medium">{props.item.title}</span>
    <span className="ml-4 shrink-0 text-xs text-foreground/45">{props.item.section ?? t('settings.rail.workspaceFallback')}</span>
  </button>;
}

export function SettingsRailActionPicker(props: {
  actions: HotkeySettingItem[];
  query: string;
  selectedAction: HotkeySettingItem | null;
  onQueryChange: (query: string) => void;
  onSelect: (item: HotkeySettingItem) => void;
}) {
  const t = useTranslation();
  const filteredActions = useMemo(
    () => props.actions.filter((item) => matchesQuery([item.title, item.section, item.commandId], props.query)),
    [props.actions, props.query]
  );
  return <>
    <div className="mb-3 text-[1.02rem] font-semibold text-foreground">{t('settings.rail.chooseAction')}</div>
    <AppInput aria-label={t('settings.rail.searchActions')} autoFocus className="h-9 text-sm" onChange={(event) => props.onQueryChange(event.target.value)} placeholder={t('settings.rail.searchActions.placeholder')} value={props.query} />
    <div className="mt-3 max-h-[420px] overflow-auto pr-1">
      {filteredActions.map((item) => <ActionPickerItem item={item} key={item.commandId} onSelect={props.onSelect} selectedAction={props.selectedAction} />)}
      {!filteredActions.length ? <p className="px-3 py-3 text-sm text-foreground/60">{t('settings.rail.noMatchingActions')}</p> : null}
    </div>
  </>;
}
