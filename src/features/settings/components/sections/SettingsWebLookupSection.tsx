import { Plus, RotateCcw } from 'lucide-react';
import { useContext, useRef, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { addWebLookupEntry, getWebLookupEntries, removeWebLookupEntry, updateWebLookupEntry, type WebLookupEntry } from '../../../../shared/platform/webLookupEntries';
import { AppIconButton, settingsActionTableAddButtonClassName, settingsActionTableClassName, settingsResetButtonClassName, SettingsSection } from '../../../../shared/ui';
import { DocumentHeaderMenuSettingsContext } from '../../context/documentHeaderMenuSettingsContext';
import { commandMenuKey, loadEditorContextMenuOrder, moveEditorContextMenuKey, saveEditorContextMenuOrder, webLookupMenuKey } from '../../model/editorContextMenuOrder';
import { resetEditorContextMenuItems } from '../../model/editorContextMenuSettings';
import type { HotkeySettingItem } from '../../model/hotkeySettings';
import type { SettingsDesktopAdapters } from '../../model/settingsDesktopAdapters';

import { CommandMenuRow, LinkMenuRow, type ContextRowDrag } from './SettingsContextMenuRows';
import { AddRailActionRow } from './SettingsRailAddActionRow';
import { MenuItemHeader } from './SettingsWebLookupSectionParts';

function useContextMenuRows() {
  const menu = useContext(DocumentHeaderMenuSettingsContext);
  const [links, setLinks] = useState(getWebLookupEntries);
  const [, setOrder] = useState(() => loadEditorContextMenuOrder(getWebLookupEntries(), menu?.contextItems ?? []));
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const draggedRef = useRef<string | null>(null);
  const orderedKeys = loadEditorContextMenuOrder(links, menu?.contextItems ?? []);

  function commitOrder(next: string[]) {
    setOrder(next);
    saveEditorContextMenuOrder(next);
  }
  const drag: ContextRowDrag = {
    draggedKey, targetKey,
    onDragEnd: () => { draggedRef.current = null; setDraggedKey(null); setTargetKey(null); },
    onDragEnter: setTargetKey,
    onDragStart: (key) => { draggedRef.current = key; setDraggedKey(key); setTargetKey(null); },
    onDrop: (target, source) => {
      const next = moveEditorContextMenuKey(orderedKeys, source || draggedRef.current || '', target);
      if (next !== orderedKeys) commitOrder(next);
      draggedRef.current = null; setDraggedKey(null); setTargetKey(null);
    }
  };
  const addLink = () => {
    const next = addWebLookupEntry();
    setLinks(next);
    const added = next.find((entry) => !links.some((old) => old.id === entry.id));
    if (added) commitOrder([...orderedKeys, webLookupMenuKey(added.id)]);
  };
  const removeLink = (id: string) => {
    if (id === 'chatgpt' && links.some((entry) => entry.id === id && entry.builtIn)) return;
    if (!links.find((entry) => entry.id === id)?.builtIn) setLinks(removeWebLookupEntry(id));
    commitOrder(orderedKeys.filter((key) => key !== webLookupMenuKey(id)));
  };
  return { menu, links, orderedKeys, drag, addLink, removeLink,
    updateLink: (id: string, patch: Partial<Pick<WebLookupEntry, 'enabled' | 'label' | 'urlTemplate'>>) => setLinks(updateWebLookupEntry(id, patch)),
    addCommand: (command: { commandId: string; label: string }) => {
      menu?.onAddContextItem(command);
      const id = menu?.contextItems.find((item) => item.commandId === command.commandId)?.id ?? `user.${command.commandId.replace(/[^a-zA-Z0-9]+/g, '-')}`;
      commitOrder([...orderedKeys, commandMenuKey(id)]);
    },
    removeCommand: (id: string) => {
      menu?.onRemoveContextItem(id);
      commitOrder(orderedKeys.filter((key) => key !== commandMenuKey(id)));
    },
    reset: () => {
      menu?.onResetContextMenu();
      commitOrder([...links.map((entry) => webLookupMenuKey(entry.id)), ...resetEditorContextMenuItems().map((item) => commandMenuKey(item.id))]);
    }
  };
}

export function SettingsWebLookupSection(props: {
  actionItems?: HotkeySettingItem[];
  resolveDocumentMenuLabel?: SettingsDesktopAdapters['resolveDocumentMenuLabel'];
} = {}) {
  const t = useTranslation();
  const rows = useContextMenuRows();
  const links = new Map(rows.links.map((entry) => [webLookupMenuKey(entry.id), entry]));
  const commands = new Map(rows.menu?.contextItems.map((item) => [commandMenuKey(item.id), item]) ?? []);
  const currentCommandIds = new Set(rows.menu?.contextItems.filter((item) => rows.orderedKeys.includes(commandMenuKey(item.id))).map((item) => item.commandId) ?? []);
  return <SettingsSection
    actions={rows.menu ? <AppIconButton className={settingsResetButtonClassName()} icon={<RotateCcw aria-hidden="true" size={16} />} label={t('settings.webLookup.resetActions')} onClick={rows.reset} /> : undefined}
    ariaLabel={t('settings.webLookup.sectionAria')}
    description={t('settings.webLookup.description')}
    title={t('settings.webLookup.title')}
  >
    <div className={settingsActionTableClassName()} role="table" aria-label={t('settings.webLookup.tableAria')}>
      <MenuItemHeader />
      {rows.orderedKeys.map((key) => {
        const link = links.get(key);
        if (link) return <LinkMenuRow drag={rows.drag} entry={link} itemKey={key} key={key} onRemove={rows.removeLink} onUpdate={rows.updateLink} />;
        const item = commands.get(key);
        if (!item || !rows.menu) return null;
        const label = props.resolveDocumentMenuLabel?.(item, t) ?? item.labelOverride ?? item.commandId;
        return <CommandMenuRow drag={rows.drag} item={item} itemKey={key} key={key} label={label} onRemove={rows.removeCommand} onToggle={rows.menu.onToggleContextItem} />;
      })}
      <div className="grid grid-cols-2 gap-3 px-4 pb-3 pt-1">
        <button className={settingsActionTableAddButtonClassName('col-span-1 w-full')} onClick={rows.addLink} type="button"><Plus aria-hidden="true" size={15} />{t('settings.webLookup.add')}</button>
        {rows.menu ? <AddRailActionRow actionItems={props.actionItems ?? []} compact currentCommandIds={currentCommandIds} onAdd={rows.addCommand} requireIcon={false} /> : null}
      </div>
    </div>
  </SettingsSection>;
}
