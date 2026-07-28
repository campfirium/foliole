import { GripVertical, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import { APP_PALETTE_COMMANDS } from '../../../../app/hooks/appPaletteCommandList';
import { localizePaletteCommandTitle } from '../../../../app/hooks/appPaletteCommandLocalization';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppIconButton,
  SettingsRow,
  SettingsSection,
  settingsResetButtonClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { useDocumentHeaderMenuSettings } from '../../context/DocumentHeaderMenuSettingsProvider';
import type { DocumentHeaderMenuItemConfig } from '../../model/documentHeaderMenuSettings';
import type { HotkeySettingItem } from '../../model/hotkeySettings';

import { AddRailActionRow } from './SettingsRailAddActionRow';

function getDocumentMenuItemLabel(item: DocumentHeaderMenuItemConfig, t: ReturnType<typeof useTranslation>) {
  const command = APP_PALETTE_COMMANDS.find((candidate) => candidate.id === item.commandId);
  return item.labelOverride ?? localizePaletteCommandTitle(item.commandId, command?.title ?? item.commandId, t);
}

function DocumentMenuVisibilitySwitch(props: {
  item: DocumentHeaderMenuItemConfig;
  label: string;
  onToggle: (visible: boolean) => void;
}) {
  const t = useTranslation();
  return (
    <button
      aria-checked={props.item.visible}
      aria-label={t('settings.documentMenu.show', { label: props.label })}
      className={settingsSwitchClassName(props.item.visible)}
      onClick={() => props.onToggle(!props.item.visible)}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" className={settingsSwitchKnobClassName(props.item.visible)} />
    </button>
  );
}

function DocumentMenuSeparatorButton(props: {
  item: DocumentHeaderMenuItemConfig;
  label: string;
  onToggle: (itemId: string, separatorBefore: boolean) => void;
}) {
  const t = useTranslation();
  const separatorEnabled = props.item.separatorBefore === true;
  return (
    <button
      aria-label={t('settings.documentMenu.separatorBefore', { label: props.label })}
      aria-pressed={separatorEnabled}
      className={[
        'absolute left-settings-panel-x right-settings-panel-x top-0 z-10 h-5 -translate-y-1/2 cursor-pointer bg-transparent p-0',
        'before:absolute before:left-0 before:right-0 before:top-1/2 before:border-t before:transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        separatorEnabled
          ? 'before:border-foreground/30 hover:before:border-foreground/40'
          : 'before:border-settings-divider/70 hover:before:border-settings-control-border-hover'
      ].join(' ')}
      onClick={() => props.onToggle(props.item.id, !separatorEnabled)}
      type="button"
    />
  );
}

function DocumentMenuManagerRow(props: {
  item: DocumentHeaderMenuItemConfig;
  label: string;
  onDragStart: (itemId: string) => void;
  onDropItem: (item: DocumentHeaderMenuItemConfig, droppedItemId?: string) => void;
  onRemove: (itemId: string) => void;
  onToggle: (itemId: string, visible: boolean) => void;
  onToggleSeparator: (itemId: string, separatorBefore: boolean) => void;
  showSeparatorControl: boolean;
}) {
  const t = useTranslation();
  return (
    <SettingsRow
      className="min-h-[56px] items-center py-2.5 pl-14"
      draggable
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDragStart={(event: DragEvent<HTMLDivElement>) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', props.item.id);
        props.onDragStart(props.item.id);
      }}
      onDrop={(event: DragEvent<HTMLDivElement>) => props.onDropItem(props.item, event.dataTransfer.getData('text/plain'))}
      title={props.label}
    >
      {props.showSeparatorControl ? (
        <DocumentMenuSeparatorButton item={props.item} label={props.label} onToggle={props.onToggleSeparator} />
      ) : null}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 cursor-grab text-settings-icon active:cursor-grabbing">
        <GripVertical aria-hidden="true" size={16} />
      </div>
      <div className="flex flex-[0_0_auto] items-center justify-end gap-2">
        {props.item.source === 'user' ? (
          <button
            aria-label={t('settings.documentMenu.remove', { label: props.label })}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground/45 transition-colors hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => props.onRemove(props.item.id)}
            type="button"
          >
            <Trash2 aria-hidden="true" size={15} />
          </button>
        ) : null}
        <DocumentMenuVisibilitySwitch
          item={props.item}
          label={props.label}
          onToggle={(visible) => props.onToggle(props.item.id, visible)}
        />
      </div>
    </SettingsRow>
  );
}

export function SettingsDocumentMenuSection({ actionItems }: { actionItems: HotkeySettingItem[] }) {
  const t = useTranslation();
  const menu = useDocumentHeaderMenuSettings();
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const currentCommandIds = new Set(menu.items.map((item) => item.commandId));

  function dropOnItem(item: DocumentHeaderMenuItemConfig, droppedItemId?: string) {
    const itemId = droppedItemId || draggedItemId;
    if (!itemId) return;
    menu.onMoveMenuItem(itemId, item.order);
    setDraggedItemId(null);
  }

  return (
    <SettingsSection
      actions={
        <AppIconButton
          className={settingsResetButtonClassName()}
          icon={<RotateCcw aria-hidden="true" size={16} />}
          label={t('settings.documentMenu.reset')}
          onClick={menu.onResetMenu}
        />
      }
      ariaLabel={t('settings.documentMenu.section.aria')}
      title={t('settings.documentMenu.title')}
    >
      {menu.items.map((item, index) => {
        const previousItem = menu.items[index - 1];
        return (
          <DocumentMenuManagerRow
            item={item}
            key={item.id}
            label={getDocumentMenuItemLabel(item, t)}
            onDragStart={setDraggedItemId}
            onDropItem={dropOnItem}
            onRemove={menu.onRemoveMenuItem}
            onToggle={menu.onToggleMenuItem}
            onToggleSeparator={menu.onToggleMenuSeparator}
            showSeparatorControl={Boolean(previousItem)}
          />
        );
      })}
      <AddRailActionRow
        actionItems={actionItems}
        currentCommandIds={currentCommandIds}
        onAdd={(command) => menu.onAddMenuItem({ commandId: command.commandId, label: command.label })}
      />
    </SettingsSection>
  );
}
