import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppIconButton, SettingsSection, settingsResetButtonClassName } from '../../../../shared/ui';
import { useDocumentHeaderMenuSettings } from '../../context/DocumentHeaderMenuSettingsProvider';
import type { DocumentHeaderMenuItemConfig } from '../../model/documentHeaderMenuSettings';
import type { HotkeySettingItem } from '../../model/hotkeySettings';
import type { SettingsDesktopAdapters } from '../../model/settingsDesktopAdapters';

import { DocumentMenuManagerRow } from './SettingsDocumentMenuSection';
import { AddRailActionRow } from './SettingsRailAddActionRow';

export function SettingsEditorContextMenuCommands({ actionItems, resolveDocumentMenuLabel, source }: {
  actionItems: HotkeySettingItem[];
  resolveDocumentMenuLabel: SettingsDesktopAdapters['resolveDocumentMenuLabel'];
  source: DocumentHeaderMenuItemConfig['source'];
}) {
  const t = useTranslation();
  const menu = useDocumentHeaderMenuSettings();
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const currentCommandIds = new Set(menu.contextItems.map((item) => item.commandId));
  const items = menu.contextItems.filter((item) => item.source === source);

  function dropOnItem(item: DocumentHeaderMenuItemConfig, droppedItemId?: string) {
    const itemId = droppedItemId || draggedItemId;
    if (!itemId || !items.some((candidate) => candidate.id === itemId)) return;
    menu.onMoveContextItem(itemId, item.order);
    setDraggedItemId(null);
  }

  return (
    <SettingsSection
      actions={source === 'system' ? <AppIconButton className={settingsResetButtonClassName()} icon={<RotateCcw aria-hidden="true" size={16} />} label={t('settings.webLookup.resetActions')} onClick={menu.onResetContextMenu} /> : undefined}
      ariaLabel={t(source === 'system' ? 'settings.webLookup.actionsTitle' : 'settings.webLookup.addedActionsTitle')}
      title={t(source === 'system' ? 'settings.webLookup.actionsTitle' : 'settings.webLookup.addedActionsTitle')}
    >
      {items.map((item, index) => (
        <DocumentMenuManagerRow
          item={item}
          key={item.id}
          label={resolveDocumentMenuLabel(item, t)}
          onDragStart={setDraggedItemId}
          onDropItem={dropOnItem}
          onRemove={menu.onRemoveContextItem}
          onToggle={menu.onToggleContextItem}
          onToggleSeparator={menu.onToggleContextSeparator}
          showSeparatorControl={index > 0}
        />
      ))}
      {source === 'user' ? <AddRailActionRow
        actionItems={actionItems}
        currentCommandIds={currentCommandIds}
        onAdd={(command) => menu.onAddContextItem({ commandId: command.commandId, label: command.label })}
        requireIcon={false}
      /> : null}
    </SettingsSection>
  );
}
