import { Plus, Trash2 } from 'lucide-react';
import type { DragEvent } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { WebLookupEntry } from '../../../../shared/platform/webLookupEntries';
import {
  settingsActionTableAddButtonClassName,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';

export const MENU_ITEM_COLUMNS = '[grid-template-columns:2rem_minmax(132px,0.36fr)_minmax(280px,1fr)_5rem_3rem]';

export function WebLookupToggle(props: {
  entry: WebLookupEntry;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslation();
  const ariaLabel = t(
    props.entry.enabled ? 'settings.webLookup.hideMenuItem' : 'settings.webLookup.showMenuItem',
    { label: props.entry.label }
  );

  return (
    <button
      aria-checked={props.entry.enabled}
      aria-label={ariaLabel}
      className={settingsSwitchClassName(props.entry.enabled)}
      onClick={() => props.onToggle(!props.entry.enabled)}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" className={settingsSwitchKnobClassName(props.entry.enabled)} />
    </button>
  );
}

export function MenuItemHeader() {
  const t = useTranslation();
  const headers = [
    { className: undefined, key: 'settings.webLookup.header.menuLabel' },
    { className: undefined, key: 'settings.webLookup.header.link' },
    { className: 'text-center', key: 'settings.webLookup.header.shown' }
  ] as const;

  return (
    <div className={settingsActionTableHeaderClassName(MENU_ITEM_COLUMNS)}>
      <span aria-hidden="true" />
      {headers.map((header) => (
        <span key={header.key} className={header.className}>{t(header.key)}</span>
      ))}
      <span className="text-right">{t('settings.webLookup.header.action')}</span>
    </div>
  );
}

export function DragHandle(props: {
  entry: WebLookupEntry;
  onDragEnd: () => void;
  onDragStart: (entryId: string) => void;
}) {
  const t = useTranslation();
  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    const row = event.currentTarget.closest('[data-web-lookup-row]');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', props.entry.id);
    if (row instanceof HTMLElement) {
      event.dataTransfer.setDragImage(row, 18, 18);
    }
    props.onDragStart(props.entry.id);
  };

  return (
    <button
      aria-label={t('settings.webLookup.move', { label: props.entry.label })}
      className="flex size-9 cursor-grab items-center justify-center rounded-md text-lg leading-none text-foreground/35 hover:text-foreground/60 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      draggable
      onDragEnd={props.onDragEnd}
      onDragStart={handleDragStart}
      onPointerDown={() => props.onDragStart(props.entry.id)}
      type="button"
    >
      ⋮⋮
    </button>
  );
}

export function MenuItemRemoveAction(props: {
  entry: WebLookupEntry;
  onRemove: (entryId: string) => void;
}) {
  const t = useTranslation();

  if (props.entry.builtIn) {
    return <span aria-hidden="true" className="size-9" />;
  }
  return (
    <button
      aria-label={t('settings.webLookup.remove', { label: props.entry.label })}
      className={settingsUtilityIconButtonClassName(false)}
      onClick={() => props.onRemove(props.entry.id)}
      title={t('settings.webLookup.removeTitle')}
      type="button"
    >
      <Trash2 aria-hidden="true" size={15} strokeWidth={1.9} />
    </button>
  );
}

export function AddMenuItemRow(props: { onAdd: () => void }) {
  const t = useTranslation();

  return (
    <div className={settingsActionTableRowClassName(MENU_ITEM_COLUMNS, 'pb-3 pt-1')}>
      <button
        aria-label={t('settings.webLookup.add')}
        className={settingsActionTableAddButtonClassName()}
        onClick={props.onAdd}
        type="button"
      >
        <Plus aria-hidden="true" size={15} strokeWidth={1.9} />
        {t('settings.webLookup.add')}
      </button>
    </div>
  );
}
