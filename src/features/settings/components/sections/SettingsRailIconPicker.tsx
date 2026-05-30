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
  compact?: boolean;
}) {
  const gridClassName = props.compact
    ? 'grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] justify-items-center gap-1.5'
    : 'grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] justify-items-center gap-2';
  const buttonClassName = (selected: boolean) =>
    props.compact
      ? `inline-flex aspect-square w-full max-w-12 items-center justify-center rounded-md border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          selected
            ? 'bg-settings-control-hover text-foreground'
            : 'bg-settings-control/35 text-foreground/66 hover:bg-settings-control-hover hover:text-foreground'
        }`
      : `inline-flex aspect-square w-full max-w-14 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          selected
            ? 'border-settings-control-border-hover bg-settings-control-active text-foreground/82'
            : 'border-transparent bg-settings-control/45 text-foreground/70 hover:bg-settings-control-hover hover:text-foreground'
        }`;
  return (
    <div className={`app-scrollbar mt-3 overflow-auto pr-2 ${props.compact ? 'max-h-[240px]' : 'max-h-[320px]'}`}>
      <div className={gridClassName}>
        {props.icons.map((icon) => (
          <button
            aria-label={`Use ${icon.label} icon`}
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
