import { Check, FileUp, icons, Settings, type LucideIcon } from 'lucide-react';

import {
  getWorkspaceRailItemLabel,
  type WorkspaceRailItemConfig
} from '../../features/settings/model/workspaceRailSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import {
  AppIconButton,
  AppSelectionDropdownMenu,
  AppSelectionDropdownMenuItem,
  ToolbarActionGroup
} from '../../shared/ui';

const RAIL_BUTTON_CLASS_NAME =
  'size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground';

const ICON_BY_ID = icons as Record<string, LucideIcon>;

function iconLabel(id: string) {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export const WORKSPACE_RAIL_ICON_OPTIONS = Object.keys(ICON_BY_ID)
  .filter((id) => !id.endsWith('Icon'))
  .sort((left, right) => left.localeCompare(right))
  .map((id) => ({ id, label: iconLabel(id) }));

export function RailItemIcon({
  iconId,
  size = 16,
  strokeWidth = 1.75
}: {
  iconId?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const props = { 'aria-hidden': true, size, strokeWidth };
  const Icon = iconId ? ICON_BY_ID[iconId] ?? FileUp : FileUp;
  return <Icon {...props} />;
}

function RailCommandButton({
  isActive,
  item,
  onRun
}: {
  isActive: boolean;
  item: WorkspaceRailItemConfig;
  onRun: (commandId: string) => void;
}) {
  return (
    <div className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center">
      <AppIconButton
        className={RAIL_BUTTON_CLASS_NAME}
        data-active={isActive}
        icon={<RailItemIcon iconId={item.iconId} />}
        label={getWorkspaceRailItemLabel(item)}
        onClick={() => onRun(item.commandId)}
      />
    </div>
  );
}

export function RailActionGroup({
  ariaLabel,
  items,
  onRun,
  isImportManagementOpen
}: {
  ariaLabel: string;
  items: WorkspaceRailItemConfig[];
  onRun: (commandId: string) => void;
  isImportManagementOpen: boolean;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <ToolbarActionGroup ariaLabel={ariaLabel} className="w-full gap-0" fullWidth orientation="vertical">
      {items.map((item) => (
        <RailCommandButton
          isActive={item.commandId === APP_COMMAND_IDS.openImportManagement && isImportManagementOpen}
          item={item}
          key={item.id}
          onRun={onRun}
        />
      ))}
    </ToolbarActionGroup>
  );
}

export function WorkspaceRailContextMenu({
  left,
  onClose,
  onCustomize,
  onToggle,
  items,
  top
}: {
  left: number;
  onClose: () => void;
  onCustomize: () => void;
  onToggle: (itemId: string, visible: boolean) => void;
  items: WorkspaceRailItemConfig[];
  top: number;
}) {
  const switchableItems = items.filter((item) => item.source === 'system' && !item.locked);
  return (
    <AppSelectionDropdownMenu left={left} onClose={onClose} top={top}>
      {switchableItems.map((item) => (
        <AppSelectionDropdownMenuItem
          className="justify-between gap-5"
          key={item.id}
          onClick={() => onToggle(item.id, !item.visible)}
        >
          <span className="inline-flex min-w-0 items-center gap-3">
            <RailItemIcon iconId={item.iconId} />
            <span className="truncate">{getWorkspaceRailItemLabel(item)}</span>
          </span>
          {item.visible ? <Check aria-hidden="true" className="shrink-0" size={15} /> : <span className="size-[15px] shrink-0" />}
        </AppSelectionDropdownMenuItem>
      ))}
      <AppSelectionDropdownMenuItem className="gap-3" onClick={onCustomize}>
        <Settings aria-hidden="true" size={16} strokeWidth={1.75} />
        <span>Customize action bar</span>
      </AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );
}
