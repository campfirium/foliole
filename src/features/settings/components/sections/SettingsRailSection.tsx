import { GripVertical, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import { RailItemIcon } from '../../../../app/components/WorkspaceRailActions';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppIconButton,
  SettingsRow,
  SettingsSection,
  settingsResetButtonClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { useWorkspaceRailSettings } from '../../context/WorkspaceRailSettingsProvider';
import type { HotkeySettingItem } from '../../model/hotkeySettings';
import {
  getWorkspaceRailItemLabel,
  getWorkspaceRailSectionItems,
  type WorkspaceRailItemConfig,
  type WorkspaceRailSection
} from '../../model/workspaceRailSettings';

import { AddRailActionRow } from './SettingsRailAddActionRow';

type ManagerSection = Exclude<WorkspaceRailSection, 'fixed'>;

function RailVisibilitySwitch({ item, label, onToggle }: { item: WorkspaceRailItemConfig; label: string; onToggle: (visible: boolean) => void }) {
  const t = useTranslation();
  return (
    <button
      aria-checked={item.visible}
      aria-label={t('settings.rail.show', { label })}
      className={settingsSwitchClassName(item.visible)}
      onClick={() => onToggle(!item.visible)}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" className={settingsSwitchKnobClassName(item.visible)} />
    </button>
  );
}

function RailManagerRow({
  item,
  label,
  onDropItem,
  onDragStart,
  onRemove,
  onToggle
}: {
  item: WorkspaceRailItemConfig;
  label: string;
  onDropItem: (item: WorkspaceRailItemConfig, droppedItemId?: string) => void;
  onDragStart: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onToggle: (itemId: string, visible: boolean) => void;
}) {
  const t = useTranslation();
  return (
    <SettingsRow
      className="min-h-[56px] items-center py-2.5 pl-20"
      draggable
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDragStart={(event: DragEvent<HTMLDivElement>) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.id);
        onDragStart(item.id);
      }}
      onDrop={(event: DragEvent<HTMLDivElement>) => onDropItem(item, event.dataTransfer.getData('text/plain'))}
      title={label}
    >
      <div className="absolute left-5 top-1/2 -translate-y-1/2 cursor-grab text-settings-icon active:cursor-grabbing">
        <GripVertical aria-hidden="true" size={16} />
      </div>
      <div className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 text-foreground/68">
        <RailItemIcon {...(item.iconId ? { iconId: item.iconId } : {})} />
      </div>
      <div className="flex flex-[0_0_auto] items-center justify-end gap-2">
        {item.source === 'user' ? (
          <button
            aria-label={t('settings.rail.remove', { label })}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground/45 transition-colors hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onRemove(item.id)}
            type="button"
          >
            <Trash2 aria-hidden="true" size={15} />
          </button>
        ) : null}
        <RailVisibilitySwitch item={item} label={label} onToggle={(visible) => onToggle(item.id, visible)} />
      </div>
    </SettingsRow>
  );
}

function RailSectionDivider({
  label,
  section,
  onDropDivider
}: {
  label: string;
  section: ManagerSection;
  onDropDivider: (section: ManagerSection, itemId: string) => void;
}) {
  return (
    <div
      aria-label={label}
      className="relative min-h-10 px-5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDropDivider(section, event.dataTransfer.getData('text/plain'))}
      role="presentation"
    >
      <div className="absolute inset-x-5 top-1/2 border-t border-dashed border-settings-divider/70" aria-hidden="true" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-settings-group px-2 text-[0.76rem] font-medium text-foreground/45">
        {label}
      </div>
    </div>
  );
}

function RailDropPlaceholder({
  onDrop
}: {
  onDrop: (itemId: string) => void;
}) {
  const t = useTranslation();
  return (
    <div
      aria-label={t('settings.rail.dropBottom')}
      className="mx-5 my-2 min-h-11"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event.dataTransfer.getData('text/plain'))}
      role="presentation"
    />
  );
}

function RailPlainDivider() {
  return (
    <div className="relative min-h-5 px-5" aria-hidden="true">
      <div className="absolute inset-x-5 top-1/2 border-t border-dashed border-settings-divider/70" />
    </div>
  );
}

function RailManagerRows({
  items,
  onDragStart,
  onDropItem,
  onRemove,
  onToggle
}: {
  items: WorkspaceRailItemConfig[];
  onDragStart: (itemId: string) => void;
  onDropItem: (item: WorkspaceRailItemConfig, droppedItemId?: string) => void;
  onRemove: (itemId: string) => void;
  onToggle: (itemId: string, visible: boolean) => void;
}) {
  return items.map((item) => (
    <RailManagerRow
      item={item}
      key={item.id}
      label={getWorkspaceRailItemLabel(item)}
      onDragStart={onDragStart}
      onDropItem={onDropItem}
      onRemove={onRemove}
      onToggle={onToggle}
    />
  ));
}

export function SettingsRailSection({ actionItems }: { actionItems: HotkeySettingItem[] }) {
  const t = useTranslation();
  const rail = useWorkspaceRailSettings();
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const topItems = getWorkspaceRailSectionItems(rail.items, 'top');
  const bottomItems = getWorkspaceRailSectionItems(rail.items, 'bottom');
  const currentCommandIds = new Set(rail.items.filter((item) => !item.locked).map((item) => item.commandId));

  function moveDraggedItem(section: ManagerSection, order: number, droppedItemId?: string) {
    const itemId = droppedItemId || draggedItemId;
    if (!itemId) {
      return;
    }
    rail.onMoveRailItem(itemId, section, order);
    setDraggedItemId(null);
  }

  function dropOnItem(item: WorkspaceRailItemConfig, droppedItemId?: string) {
    moveDraggedItem(item.section === 'bottom' ? 'bottom' : 'top', item.order, droppedItemId);
  }

  return (
    <SettingsSection
      actions={
        <AppIconButton
          className={settingsResetButtonClassName()}
          icon={<RotateCcw aria-hidden="true" size={16} />}
          label={t('settings.rail.reset')}
          onClick={rail.onResetRail}
        />
      }
      ariaLabel={t('settings.rail.section.aria')}
      title={t('settings.rail.title')}
    >
      <RailSectionDivider label={t('settings.rail.area.top')} section="top" onDropDivider={(section, itemId) => moveDraggedItem(section, 0, itemId)} />
      <RailManagerRows items={topItems} onDragStart={setDraggedItemId} onDropItem={dropOnItem} onRemove={rail.onRemoveRailItem} onToggle={rail.onToggleRailItem} />
      <RailSectionDivider label={t('settings.rail.area.bottom')} section="bottom" onDropDivider={(section, itemId) => moveDraggedItem(section, 0, itemId)} />
      <RailManagerRows items={bottomItems} onDragStart={setDraggedItemId} onDropItem={dropOnItem} onRemove={rail.onRemoveRailItem} onToggle={rail.onToggleRailItem} />
      <RailDropPlaceholder onDrop={(itemId) => moveDraggedItem('bottom', bottomItems.length, itemId)} />
      <RailPlainDivider />
      <AddRailActionRow actionItems={actionItems} currentCommandIds={currentCommandIds} onAdd={rail.onAddRailItem} />
    </SettingsSection>
  );
}
