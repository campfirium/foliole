import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';

import {
  AppIconButton,
  AppInput,
  LucideCatalogIcon,
  LUCIDE_ICON_OPTIONS,
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
}) {
  return (
    <div className="mt-3 max-h-[420px] overflow-auto pr-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] justify-items-center gap-2.5">
        {props.icons.map((icon) => (
          <button
            aria-label={`Use ${icon.label} icon`}
            className={`inline-flex aspect-square w-full max-w-16 items-center justify-center rounded-md border transition-colors ${
              props.selectedIconId === icon.id
                ? 'border-settings-outline bg-settings-selected text-foreground'
                : 'border-transparent bg-settings-control/45 text-foreground/70 hover:bg-settings-control-hover hover:text-foreground'
            }`}
            key={icon.id}
            onClick={() => props.onSelect(icon.id)}
            title={icon.label}
            type="button"
          >
            <LucideCatalogIcon iconId={icon.id} size={28} strokeWidth={1.85} />
          </button>
        ))}
      </div>
      {!props.icons.length ? <p className="px-3 py-3 text-sm text-foreground/60">No matching icons.</p> : null}
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
          label="Choose another action"
          onClick={props.onBack}
        />
        <div className="min-w-0 truncate text-[1.02rem] font-semibold text-foreground">Choose an icon for the action</div>
      </div>
      <AppInput
        aria-label="Search icons"
        autoFocus
        className="h-9 text-sm"
        onChange={(event) => props.onQueryChange(event.target.value)}
        placeholder="Search icons..."
        value={props.query}
      />
      <IconGrid icons={filteredIcons} selectedIconId={props.selectedIconId} onSelect={props.onSelect} />
    </>
  );
}
