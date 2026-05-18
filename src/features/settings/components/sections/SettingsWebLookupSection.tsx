import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  addWebLookupEntry,
  getWebLookupEntries,
  removeWebLookupEntry,
  updateWebLookupEntry,
  type WebLookupEntry
} from '../../../../shared/platform/webLookupEntries';
import {
  settingsActionTableAddButtonClassName,
  settingsActionTableClassName,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName,
  settingsFieldClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName,
  settingsUtilityIconButtonClassName,
  SettingsSection
} from '../../../../shared/ui';

const MENU_ITEM_COLUMNS = '[grid-template-columns:2rem_minmax(132px,0.52fr)_minmax(280px,1fr)_5rem_3rem]';
const MENU_ITEM_HEADERS = ['Name', 'Link', 'Enabled'];

function WebLookupToggle(props: {
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

function MenuItemHeader() {
  return (
    <div className={settingsActionTableHeaderClassName(MENU_ITEM_COLUMNS)}>
      <span aria-hidden="true" />
      {MENU_ITEM_HEADERS.map((label) => (
        <span key={label}>{label}</span>
      ))}
      <span className="text-right">Action</span>
    </div>
  );
}

function MenuItemRow(props: {
  entry: WebLookupEntry;
  onRemove: (entryId: string) => void;
  onUpdate: (entryId: string, patch: Partial<Pick<WebLookupEntry, 'enabled' | 'label' | 'urlTemplate'>>) => void;
}) {
  return (
    <div className={settingsActionTableRowClassName(MENU_ITEM_COLUMNS)}>
      <div aria-hidden="true" className="select-none text-lg leading-none text-foreground/35">⋮⋮</div>
      <input
        aria-label={`${props.entry.label} menu item name`}
        className={settingsFieldClassName()}
        onChange={(event) => props.onUpdate(props.entry.id, { label: event.target.value })}
        value={props.entry.label}
      />
      <textarea
        aria-label={`${props.entry.label} link`}
        className={settingsFieldClassName('min-h-[3.75rem] resize-y py-2 font-mono leading-5')}
        onChange={(event) => props.onUpdate(props.entry.id, { urlTemplate: event.target.value })}
        spellCheck={false}
        value={props.entry.urlTemplate}
      />
      <div className="flex justify-center">
        <WebLookupToggle
          entry={props.entry}
          onToggle={(enabled) => props.onUpdate(props.entry.id, { enabled })}
        />
      </div>
      <button
        aria-label={`Remove ${props.entry.label}`}
        className={settingsUtilityIconButtonClassName(false)}
        disabled={props.entry.builtIn}
        onClick={() => props.onRemove(props.entry.id)}
        title={props.entry.builtIn ? 'Built-in menu items can be hidden, not removed.' : 'Remove menu item'}
        type="button"
      >
        <Trash2 aria-hidden="true" size={15} strokeWidth={1.9} />
      </button>
    </div>
  );
}

function AddMenuItemRow(props: { onAdd: () => void }) {
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

export function SettingsWebLookupSection() {
  const [entries, setEntries] = useState(() => getWebLookupEntries());
  const handleUpdate = (entryId: string, patch: Partial<Pick<WebLookupEntry, 'enabled' | 'label' | 'urlTemplate'>>) => {
    setEntries(updateWebLookupEntry(entryId, patch));
  };
  const handleRemove = (entryId: string) => {
    setEntries(removeWebLookupEntry(entryId));
  };

  return (
    <SettingsSection
      ariaLabel="Right-click menu items settings section"
      description="Configure the menu item name and the link it opens. Use {selection} where Foliole should insert the current text."
      title="Right-click menu items"
    >
      <div className={settingsActionTableClassName()} role="table" aria-label="Right-click menu items">
        <MenuItemHeader />
        {entries.map((entry) => (
          <MenuItemRow
            entry={entry}
            key={entry.id}
            onRemove={handleRemove}
            onUpdate={handleUpdate}
          />
        ))}
        <AddMenuItemRow onAdd={() => setEntries(addWebLookupEntry())} />
      </div>
    </SettingsSection>
  );
}
