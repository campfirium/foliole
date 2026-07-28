import { RefreshCw } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useDocumentHeaderMenuSettings } from '../../features/settings/context/DocumentHeaderMenuSettingsProvider';
import type { DocumentHeaderMenuItemConfig } from '../../features/settings/model/documentHeaderMenuSettings';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { setWhitelistedLocalStorageItem } from '../../shared/platform/storage';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppIconButton,
  ToolbarActionGroup
} from '../../shared/ui';
import { APP_PALETTE_COMMANDS } from '../hooks/appPaletteCommandList';
import { localizePaletteCommandTitle } from '../hooks/appPaletteCommandLocalization';

import { DocumentPanelHeaderBacklinksMenu } from './DocumentPanelHeaderBacklinksMenu';
import { MoreOptionsIcon } from './DocumentPanelHeaderIcons';
import { DocumentPriorityControl } from './DocumentPriorityControl';

const PUBLISH_COMMAND_IDS = new Set<string>([
  APP_COMMAND_IDS.publishToFoliole,
  APP_COMMAND_IDS.publishToWordPress,
  APP_COMMAND_IDS.publishToDiscourse
]);

function SourceUpdateAction({
  isOpen,
  onRunCommand,
  t,
  visible
}: {
  isOpen: boolean;
  onRunCommand?: (commandId: string) => void;
  t: Translate;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }
  return (
    <AppIconButton
      aria-pressed={isOpen}
      className="text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
      data-active={isOpen}
      data-command-id={APP_COMMAND_IDS.reviewSourceUpdate}
      icon={<RefreshCw aria-hidden="true" size={16} strokeWidth={1.8} />}
      label={t('desktop.command.reviewSourceUpdate')}
      onClick={() => onRunCommand?.(APP_COMMAND_IDS.reviewSourceUpdate)}
    />
  );
}

export function renderDefaultDocumentHeaderRightSlot(args: {
  activeNodeId: string | null;
  backlinks: BacklinkItem[];
  editableNodeId: string | null;
  nodesById: Record<string, Node>;
  onNodePriorityChange: (nodeId: string, priority: number | null) => void;
  onSelectBacklinkNode: (nodeId: string) => void;
  priorityQuickSetShortcutLabel: string;
  reviewSchedulerSettings: ReviewSchedulerSettings;
}) {
  return (
    <>
      <DocumentPanelHeaderBacklinksMenu backlinks={args.backlinks} onSelectNode={args.onSelectBacklinkNode} />
      <DocumentPriorityControl
        activeNodeId={args.activeNodeId}
        defaultPriority={args.reviewSchedulerSettings.pushQueue.defaultPriority}
        editableNodeId={args.editableNodeId}
        nodesById={args.nodesById}
        onPriorityChange={args.onNodePriorityChange}
        shortcutLabel={args.priorityQuickSetShortcutLabel}
      />
    </>
  );
}

interface DocumentHeaderActionsProps {
  canOpenComparisonView: boolean;
  editorDisplayMode: ReturnType<typeof useAppearanceSettings>['editorDisplayMode'];
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  onToggleSourceUpdatePanel: () => void;
  onRunDocumentCommand?: ((commandId: string) => void) | undefined;
  showSourceUpdateAction: boolean;
  showDocumentControls: boolean;
  showPublishActions: boolean;
  toggleEditorDisplayMode: () => void;
  t: Translate;
}

function isMenuItemAvailable(item: DocumentHeaderMenuItemConfig, args: DocumentHeaderActionsProps) {
  if (!item.visible) return false;
  if (PUBLISH_COMMAND_IDS.has(item.commandId)) return args.showPublishActions;
  if (item.commandId === APP_COMMAND_IDS.toggleComparisonView) return args.canOpenComparisonView;
  return true;
}

function getMenuItemLabel(item: DocumentHeaderMenuItemConfig, args: DocumentHeaderActionsProps) {
  if (item.commandId === APP_COMMAND_IDS.toggleEditorDisplayMode) {
    return args.editorDisplayMode === 'preview'
      ? args.t('desktop.document.switchToSource')
      : args.t('desktop.document.switchToLivePreview');
  }
  const command = APP_PALETTE_COMMANDS.find((candidate) => candidate.id === item.commandId);
  return item.labelOverride ?? localizePaletteCommandTitle(item.commandId, command?.title ?? item.commandId, args.t);
}

function runMenuItemCommand(item: DocumentHeaderMenuItemConfig, args: DocumentHeaderActionsProps) {
  if (item.commandId === APP_COMMAND_IDS.toggleEditorDisplayMode) {
    args.toggleEditorDisplayMode();
    return;
  }
  if (item.commandId === APP_COMMAND_IDS.customizeDocumentMenu) {
    openDocumentMenuSettings(args);
    return;
  }
  args.onRunDocumentCommand?.(item.commandId);
}

function openDocumentMenuSettings(args: DocumentHeaderActionsProps) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory, 'document-menu');
  args.onRunDocumentCommand?.(APP_COMMAND_IDS.openSettings);
}

function renderDocumentMenuItems(items: DocumentHeaderMenuItemConfig[], args: DocumentHeaderActionsProps) {
  const visibleItems = items.filter((item) => isMenuItemAvailable(item, args));
  const firstNonPublishIndex = visibleItems.findIndex((item) => !PUBLISH_COMMAND_IDS.has(item.commandId));
  return (
    <>
      {visibleItems.map((item, index) => (
        <Fragment key={item.id}>
          {index === firstNonPublishIndex && index > 0 ? <AppDropdownMenuSeparator /> : null}
          <AppDropdownMenuItem onSelect={() => runMenuItemCommand(item, args)}>
            {getMenuItemLabel(item, args)}
          </AppDropdownMenuItem>
        </Fragment>
      ))}
    </>
  );
}

function DocumentHeaderActions(args: DocumentHeaderActionsProps): ReactNode {
  const menu = useDocumentHeaderMenuSettings();
  if (args.isFolderListView || !args.showDocumentControls) {
    return null;
  }

  return (
    <ToolbarActionGroup ariaLabel={args.t('desktop.document.editorActions')} className="justify-end">
      <SourceUpdateAction
        isOpen={args.isSourceUpdatePanelOpen}
        {...(args.onRunDocumentCommand ? { onRunCommand: args.onRunDocumentCommand } : {})}
        t={args.t}
        visible={args.showSourceUpdateAction}
      />
      <AppDropdownMenu>
        <AppDropdownMenuTrigger asChild>
          <AppIconButton
            className="text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
            icon={<MoreOptionsIcon />}
            label={args.t('desktop.document.moreEditorOptions')}
          />
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="end" sideOffset={6}>
          {renderDocumentMenuItems(menu.items, args)}
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </ToolbarActionGroup>
  );
}

export function renderDocumentHeaderActions(args: DocumentHeaderActionsProps): ReactNode {
  return <DocumentHeaderActions {...args} />;
}
