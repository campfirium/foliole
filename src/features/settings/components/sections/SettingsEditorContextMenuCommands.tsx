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

export function SettingsEditorContextMenuCommands({ actionItems, resolveDocumentMenuLabel }: {
  actionItems: HotkeySettingItem[];
  resolveDocumentMenuLabel: SettingsDesktopAdapters['resolveDocumentMenuLabel'];
}) {
  const t = useTranslation();
  const menu = useDocumentHeaderMenuSettings();
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const currentCommandIds = new Set(menu.contextItems.map((item) => item.commandId));

  function dropOnItem(item: DocumentHeaderMenuItemConfig, droppedItemId?: string) {
    const itemId = droppedItemId || draggedItemId;
    if (!itemId) return;
    menu.onMoveContextItem(itemId, item.order);
    setDraggedItemId(null);
  }

  return (
    <SettingsSection
      actions={<AppIconButton className={settingsResetButtonClassName()} icon={<RotateCcw aria-hidden="true" size={16} />} label={t('settings.webLookup.resetActions')} onClick={menu.onResetContextMenu} />}
      ariaLabel={t('settings.webLookup.actionsTitle')}
      title={t('settings.webLookup.actionsTitle')}
    >
      {menu.contextItems.map((item, index) => (
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
      <AddRailActionRow
        actionItems={actionItems}
        currentCommandIds={currentCommandIds}
        onAdd={(command) => menu.onAddContextItem({ commandId: command.commandId, label: command.label })}
        requireIcon={false}
      />
    </SettingsSection>
  );
}
