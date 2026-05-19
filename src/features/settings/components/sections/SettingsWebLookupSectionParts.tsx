import { Plus, Trash2 } from 'lucide-react';
import type { DragEvent } from 'react';

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

const MENU_ITEM_HEADERS = ['Name', 'Link', 'Shown'];

export function WebLookupToggle(props: {
  entry: WebLookupEntry;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <button
      aria-checked={props.entry.enabled}
      aria-label={`${props.entry.enabled ? 'Hide' : 'Show'} ${props.entry.label} in context menu`}
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
  return (
    <div className={settingsActionTableHeaderClassName(MENU_ITEM_COLUMNS)}>
      <span aria-hidden="true" />
      {MENU_ITEM_HEADERS.map((label) => (
        <span key={label} className={label === 'Shown' ? 'text-center' : undefined}>{label}</span>
      ))}
      <span className="text-right">Action</span>
    </div>
  );
}

export function DragHandle(props: {
  entry: WebLookupEntry;
  onDragEnd: () => void;
  onDragStart: (entryId: string) => void;
}) {
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
      aria-label={`Move ${props.entry.label}`}
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
  if (props.entry.builtIn) {
    return <span aria-hidden="true" className="size-9" />;
  }
  return (
    <button
      aria-label={`Remove ${props.entry.label}`}
      className={settingsUtilityIconButtonClassName(false)}
      onClick={() => props.onRemove(props.entry.id)}
      title="Remove menu item"
      type="button"
    >
      <Trash2 aria-hidden="true" size={15} strokeWidth={1.9} />
    </button>
  );
}

export function AddMenuItemRow(props: { onAdd: () => void }) {
  return (
    <div className={settingsActionTableRowClassName(MENU_ITEM_COLUMNS, 'pb-3 pt-1')}>
      <button
        aria-label="Add menu item"
        className={settingsActionTableAddButtonClassName()}
        onClick={props.onAdd}
        type="button"
      >
        <Plus aria-hidden="true" size={15} strokeWidth={1.9} />
        Add menu item
      </button>
    </div>
  );
}
