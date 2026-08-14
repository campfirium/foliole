import { Check, Settings } from 'lucide-react';

import { useCommandShortcutMap } from '../../features/settings/context/hotkeySettingsContext';
import {
  getWorkspaceRailItemLabel,
  type WorkspaceRailItemConfig
} from '../../features/settings/model/workspaceRailSettings';
import { APP_COMMAND_IDS, type AppCommandId } from '../../shared/commands/ids';
import { formatAriaKeyShortcuts } from '../../shared/commands/shortcuts';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppSelectionDropdownMenu,
  AppSelectionDropdownMenuItem,
  LucideCatalogIcon,
  ToolbarActionGroup
} from '../../shared/ui';

import { WorkspaceAppearanceModeIcon } from './WorkspaceAppearanceModeIcon';
import {
  WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME,
  WorkspaceRailTooltipButton
} from './WorkspaceRailTooltipButton';
import { WorkspaceThemeModeAction } from './WorkspaceThemeModeAction';

const RAIL_BUTTON_CLASS_NAME =
  `size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground ${WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME}`;
export function RailItemIcon({
  commandId,
  iconId,
  size = 16,
  strokeWidth = 1.75
}: {
  commandId?: string;
  iconId?: string;
  size?: number;
  strokeWidth?: number;
}) {
  if (commandId === APP_COMMAND_IDS.toggleBaseColorMode) {
    return <WorkspaceAppearanceModeIcon size={size} strokeWidth={strokeWidth} />;
  }
  return <LucideCatalogIcon {...(iconId ? { iconId } : {})} size={size} strokeWidth={strokeWidth} />;
}

function RailCommandButton({
  item,
  onRun
}: {
  item: WorkspaceRailItemConfig;
  onRun: (commandId: string) => void;
}) {
  const t = useTranslation();
  const shortcutMap = useCommandShortcutMap();
  if (item.commandId === APP_COMMAND_IDS.toggleBaseColorMode) {
    return <WorkspaceThemeModeAction onRunRailAction={onRun} />;
  }
  return (
    <div className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center">
      <WorkspaceRailTooltipButton
        className={RAIL_BUTTON_CLASS_NAME}
        icon={<RailItemIcon commandId={item.commandId} {...(item.iconId ? { iconId: item.iconId } : {})} />}
        label={getWorkspaceRailItemLabel(item, t)}
        onClick={() => onRun(item.commandId)}
        aria-keyshortcuts={formatAriaKeyShortcuts(shortcutMap[item.commandId as AppCommandId])}
      />
    </div>
  );
}

export function RailActionGroup({
  ariaLabel,
  items,
  onRun
}: {
  ariaLabel: string;
  items: WorkspaceRailItemConfig[];
  onRun: (commandId: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <ToolbarActionGroup ariaLabel={ariaLabel} className="w-full gap-0" fullWidth orientation="vertical">
      {items.map((item) => (
        <RailCommandButton
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
  const t = useTranslation();
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
            <RailItemIcon commandId={item.commandId} {...(item.iconId ? { iconId: item.iconId } : {})} />
            <span className="truncate">{getWorkspaceRailItemLabel(item, t)}</span>
          </span>
          {item.visible ? <Check aria-hidden="true" className="shrink-0" size={15} /> : <span className="size-[15px] shrink-0" />}
        </AppSelectionDropdownMenuItem>
      ))}
      <AppSelectionDropdownMenuItem className="gap-3" onClick={onCustomize}>
        <Settings aria-hidden="true" size={16} strokeWidth={1.75} />
        <span>{t('desktop.rail.customizeActionBar')}</span>
      </AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );
}
