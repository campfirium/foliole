import { useRef, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  addWebLookupEntry,
  getWebLookupEntries,
  moveWebLookupEntry,
  removeWebLookupEntry,
  updateWebLookupEntry,
  type WebLookupEntry
} from '../../../../shared/platform/webLookupEntries';
import {
  settingsActionTableClassName,
  settingsActionTableRowClassName,
  settingsFieldClassName,
  SettingsSection
} from '../../../../shared/ui';
import type { HotkeySettingItem } from '../../model/hotkeySettings';
import type { SettingsDesktopAdapters } from '../../model/settingsDesktopAdapters';

import { SettingsEditorContextMenuCommands } from './SettingsEditorContextMenuCommands';
import {
  AddMenuItemRow,
  DragHandle,
  MENU_ITEM_COLUMNS,
  MenuItemHeader,
  MenuItemRemoveAction,
  WebLookupToggle
} from './SettingsWebLookupSectionParts';

function MenuItemRow(props: {
  draggedEntryId: string | null;
  dragTargetEntryId: string | null;
  entry: WebLookupEntry;
  onDragEnd: () => void;
  onDragEnter: (entryId: string) => void;
  onDragStart: (entryId: string) => void;
  onDrop: (targetId: string, sourceId: string) => void;
  onRemove: (entryId: string) => void;
  onUpdate: (entryId: string, patch: Partial<Pick<WebLookupEntry, 'enabled' | 'label' | 'urlTemplate'>>) => void;
}) {
  const t = useTranslation();

  return (
    <div
      className={settingsActionTableRowClassName(
        MENU_ITEM_COLUMNS,
        props.draggedEntryId === props.entry.id
          ? 'bg-settings-control-active opacity-70'
          : props.dragTargetEntryId === props.entry.id
            ? 'bg-settings-control-hover ring-1 ring-ring/45'
            : undefined
      )}
      data-testid={`web-lookup-row-${props.entry.id}`}
      data-web-lookup-row
      onDragEnter={() => props.onDragEnter(props.entry.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => props.onDrop(props.entry.id, event.dataTransfer.getData('text/plain'))}
    >
      <DragHandle entry={props.entry} onDragEnd={props.onDragEnd} onDragStart={props.onDragStart} />
      <input
        aria-label={t('settings.webLookup.menuLabelAria', { label: props.entry.label })}
        className={settingsFieldClassName()}
        onChange={(event) => props.onUpdate(props.entry.id, { label: event.target.value })}
        value={props.entry.label}
      />
      <input
        aria-label={t('settings.webLookup.linkAria', { label: props.entry.label })}
        className={settingsFieldClassName('font-mono text-[0.82rem]')}
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
      <div className="flex justify-end">
        <MenuItemRemoveAction entry={props.entry} onRemove={props.onRemove} />
      </div>
    </div>
  );
}

function useWebLookupEntryControls() {
  const [entries, setEntries] = useState(() => getWebLookupEntries());
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [dragTargetEntryId, setDragTargetEntryId] = useState<string | null>(null);
  const draggedEntryIdRef = useRef<string | null>(null);
  const handleUpdate = (entryId: string, patch: Partial<Pick<WebLookupEntry, 'enabled' | 'label' | 'urlTemplate'>>) => {
    setEntries(updateWebLookupEntry(entryId, patch));
  };
  const handleRemove = (entryId: string) => {
    setEntries(removeWebLookupEntry(entryId));
  };
  const handleDrop = (targetId: string, sourceId: string) => {
    const entryId = sourceId || draggedEntryIdRef.current;
    if (entryId) {
      setEntries(moveWebLookupEntry(entryId, targetId));
    }
    draggedEntryIdRef.current = null;
    setDraggedEntryId(null);
    setDragTargetEntryId(null);
  };
  const handleDragStart = (entryId: string) => {
    draggedEntryIdRef.current = entryId;
    setDraggedEntryId(entryId);
    setDragTargetEntryId(null);
  };
  const handleDragEnd = () => {
    draggedEntryIdRef.current = null;
    setDraggedEntryId(null);
    setDragTargetEntryId(null);
  };
  return { draggedEntryId, dragTargetEntryId, entries, handleDragEnd, handleDragStart, handleDrop, handleRemove, handleUpdate, setDragTargetEntryId, setEntries };
}

export function SettingsWebLookupSection(props: {
  actionItems?: HotkeySettingItem[];
  resolveDocumentMenuLabel?: SettingsDesktopAdapters['resolveDocumentMenuLabel'];
} = {}) {
  const t = useTranslation();
  const controls = useWebLookupEntryControls();

  return (
    <>
      {props.resolveDocumentMenuLabel ? <SettingsEditorContextMenuCommands actionItems={props.actionItems ?? []} resolveDocumentMenuLabel={props.resolveDocumentMenuLabel} source="system" /> : null}
      <SettingsSection
        ariaLabel={t('settings.webLookup.sectionAria')}
        description={t('settings.webLookup.description')}
        title={t('settings.webLookup.title')}
      >
        <div className={settingsActionTableClassName()} role="table" aria-label={t('settings.webLookup.tableAria')}>
          <MenuItemHeader />
          {controls.entries.map((entry) => (
            <MenuItemRow
              dragTargetEntryId={controls.dragTargetEntryId}
              draggedEntryId={controls.draggedEntryId}
              entry={entry}
              key={entry.id}
              onDragEnd={controls.handleDragEnd}
              onDragEnter={controls.setDragTargetEntryId}
              onDragStart={controls.handleDragStart}
              onDrop={controls.handleDrop}
              onRemove={controls.handleRemove}
              onUpdate={controls.handleUpdate}
            />
          ))}
          <AddMenuItemRow onAdd={() => controls.setEntries(addWebLookupEntry())} />
        </div>
      </SettingsSection>
      {props.resolveDocumentMenuLabel ? <SettingsEditorContextMenuCommands actionItems={props.actionItems ?? []} resolveDocumentMenuLabel={props.resolveDocumentMenuLabel} source="user" /> : null}
    </>
  );
}
