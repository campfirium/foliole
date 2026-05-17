import { Route, Settings } from 'lucide-react';
import { useState } from 'react';

import { useWorkspaceRailSettings } from '../../features/settings/context/WorkspaceRailSettingsProvider';
import {
  getWorkspaceRailSectionItems
} from '../../features/settings/model/workspaceRailSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { definedProps } from '../../shared/lib/definedProps';
import { setWhitelistedLocalStorageItem } from '../../shared/platform/storage';
import { AppIconButton, AppToolbar, AppTooltip, AppTooltipContent, AppTooltipTrigger, ToolbarActionGroup } from '../../shared/ui';

import { RailActionGroup, WorkspaceRailContextMenu } from './WorkspaceRailActions';
import { WorkspaceRailTooltipButton } from './WorkspaceRailTooltipButton';
import { getWorkspaceSurfaceDividerColor } from './WorkspaceSurfaceRowOverlay';
import { WorkspaceThemeModeAction } from './WorkspaceThemeModeAction';

interface WorkspaceSideToolbarProps {
  canStartStudyMode: boolean;
  isImportManagementOpen: boolean;
  isStudyMode: boolean;
  isSettingsOpen: boolean;
  reviewDueCount: number;
  showStudyDock?: boolean;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onOpenImportManagement: () => void;
  onOpenSettings: () => void;
  onRunRailAction?: (commandId: string) => void;
  onToggleReviewSession: () => void;
}

function SettingsAction({ isSettingsOpen, onOpenSettings }: { isSettingsOpen: boolean; onOpenSettings: () => void }) {
  return (
    <ToolbarActionGroup
      ariaLabel="Workspace settings actions"
      className="h-[var(--workspace-top-toolbar-height)] w-full justify-center"
      fullWidth
      orientation="vertical"
    >
      <WorkspaceRailTooltipButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
        data-active={isSettingsOpen}
        icon={<Settings aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Settings"
        onClick={onOpenSettings}
      />
    </ToolbarActionGroup>
  );
}

function StudyAction({
  isStudyMode,
  onToggleReviewSession,
  reviewStatusText
}: {
  isStudyMode: boolean;
  onToggleReviewSession: () => void;
  reviewStatusText: string;
}) {
  return (
    <ToolbarActionGroup
      ariaLabel="Workspace study actions"
      className="h-[var(--workspace-bottom-toolbar-height)] w-full justify-center px-1"
      fullWidth
      orientation="vertical"
    >
      <AppTooltip>
        <AppTooltipTrigger asChild>
          <span className="inline-flex">
            <AppIconButton
              className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
              data-active={isStudyMode}
              icon={<Route aria-hidden="true" size={16} strokeWidth={1.75} />}
              label="Study"
              onClick={onToggleReviewSession}
            />
          </span>
        </AppTooltipTrigger>
        <AppTooltipContent>{reviewStatusText}</AppTooltipContent>
      </AppTooltip>
    </ToolbarActionGroup>
  );
}

function useWorkspaceRailToolbarState({
  onOpenImportManagement,
  onOpenSettings,
  onRunRailAction,
  onStartClipboardImport,
  onStartImport
}: Pick<
  WorkspaceSideToolbarProps,
  'onOpenImportManagement' | 'onOpenSettings' | 'onRunRailAction' | 'onStartClipboardImport' | 'onStartImport'
>) {
  const rail = useWorkspaceRailSettings();
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const topItems = getWorkspaceRailSectionItems(rail.items, 'top').filter((item) => item.visible);
  const bottomItems = getWorkspaceRailSectionItems(rail.items, 'bottom').filter((item) => item.visible);

  function runRailCommand(commandId: string) {
    if (commandId === APP_COMMAND_IDS.importSingleFile) {
      onStartImport();
    } else if (commandId === APP_COMMAND_IDS.clipboardImport) {
      onStartClipboardImport();
    } else if (commandId === APP_COMMAND_IDS.openImportManagement) {
      onOpenImportManagement();
    } else {
      onRunRailAction?.(commandId);
    }
  }

  function openRailManager() {
    setContextMenuPosition(null);
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory, 'rail');
    onOpenSettings();
  }

  return { bottomItems, contextMenuPosition, openRailManager, rail, runRailCommand, setContextMenuPosition, topItems };
}

function renderStudyDock(props: {
  isStudyMode: boolean;
  onToggleReviewSession: () => void;
  reviewStatusText: string;
  showStudyDock: boolean;
}) {
  if (!props.showStudyDock) {
    return null;
  }
  return (
    <>
      {props.isStudyMode ? (
        <div
          aria-hidden="true"
          className="w-full shrink-0 border-t"
          data-testid="workspace-study-divider"
          style={{ borderTopColor: getWorkspaceSurfaceDividerColor('main', 'rail') }}
        />
      ) : null}
      <div className="flex h-[var(--workspace-bottom-toolbar-height)] w-full shrink-0 items-center justify-center">
        <StudyAction
          isStudyMode={props.isStudyMode}
          onToggleReviewSession={props.onToggleReviewSession}
          reviewStatusText={props.reviewStatusText}
        />
      </div>
    </>
  );
}

export function WorkspaceSideToolbar(props: WorkspaceSideToolbarProps) {
  const state = useWorkspaceRailToolbarState(props);
  const reviewStatusText = props.isStudyMode
    ? `Reviewing (${Math.max(props.reviewDueCount, 0)} remaining)`
    : props.reviewDueCount > 0
      ? `Start review (${props.reviewDueCount} due)`
      : 'Start review (no due cards)';

  return (
    <AppToolbar
      aria-label="Workspace side toolbar"
      className="workspace-region-main-rail flex h-full w-[var(--workspace-rail-width)] flex-col"
      onContextMenu={(event) => {
        event.preventDefault();
        state.setContextMenuPosition({ left: event.clientX, top: event.clientY });
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center">
        <RailActionGroup
          ariaLabel="Workspace top rail actions"
          isImportManagementOpen={props.isImportManagementOpen}
          items={state.topItems}
          onRun={state.runRailCommand}
        />
        <div className="flex-1" />
        <RailActionGroup
          ariaLabel="Workspace bottom rail actions"
          isImportManagementOpen={props.isImportManagementOpen}
          items={state.bottomItems}
          onRun={state.runRailCommand}
        />
        <WorkspaceThemeModeAction {...definedProps({ onRunRailAction: props.onRunRailAction })} />
        <SettingsAction isSettingsOpen={props.isSettingsOpen} onOpenSettings={props.onOpenSettings} />
      </div>
      {renderStudyDock({
        isStudyMode: props.isStudyMode,
        onToggleReviewSession: props.onToggleReviewSession,
        reviewStatusText,
        showStudyDock: props.showStudyDock ?? true
      })}
      {state.contextMenuPosition ? (
        <WorkspaceRailContextMenu
          items={state.rail.items}
          left={state.contextMenuPosition.left}
          onClose={() => state.setContextMenuPosition(null)}
          onCustomize={state.openRailManager}
          onToggle={state.rail.onToggleRailItem}
          top={state.contextMenuPosition.top}
        />
      ) : null}
    </AppToolbar>
  );
}

export function WorkspaceStudyDockTrigger(props: {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  onToggleReviewSession: () => void;
  reviewDueCount: number;
}) {
  const reviewStatusText = props.isStudyMode
    ? `Reviewing (${Math.max(props.reviewDueCount, 0)} remaining)`
    : props.reviewDueCount > 0
      ? `Start review (${props.reviewDueCount} due)`
      : 'Start review (no due cards)';

  return (
    <div
      className="flex h-[var(--workspace-bottom-toolbar-height)] w-[var(--workspace-rail-width)] shrink-0 items-center justify-center"
      style={{ backgroundColor: 'var(--workspace-region-footer-rail-bg)' }}
    >
      <StudyAction
        isStudyMode={props.isStudyMode}
        onToggleReviewSession={props.onToggleReviewSession}
        reviewStatusText={reviewStatusText}
      />
    </div>
  );
}
