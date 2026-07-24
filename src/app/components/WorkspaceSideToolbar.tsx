import { Settings } from 'lucide-react';
import { useState } from 'react';

import { useWorkspaceRailSettings } from '../../features/settings/context/WorkspaceRailSettingsProvider';
import {
  getWorkspaceRailSectionItems
} from '../../features/settings/model/workspaceRailSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { setWhitelistedLocalStorageItem } from '../../shared/platform/storage';
import { AppToolbar, ToolbarActionGroup } from '../../shared/ui';

import { WorkspaceDemoRailBottomActions } from './WorkspaceDemoRailBottomActions';
import { RailActionGroup, WorkspaceRailContextMenu } from './WorkspaceRailActions';
import {
  WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME,
  WorkspaceRailTooltipButton
} from './WorkspaceRailTooltipButton';
import { useDemoMarkdownRailImport } from './WorkspaceSideToolbarDemoImport';
import { renderStudyDock } from './WorkspaceStudyDock';
import { WorkspaceThemeModeAction } from './WorkspaceThemeModeAction';
import { WorkspaceUpdateAction } from './WorkspaceUpdateAction';

interface WorkspaceSideToolbarProps {
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  isSettingsOpen: boolean;
  showStudyDock?: boolean;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onOpenSettings: () => void;
  onRunRailAction?: (commandId: string) => void;
  onToggleReviewSession: () => void;
}

function SettingsAction({ isSettingsOpen, onOpenSettings }: { isSettingsOpen: boolean; onOpenSettings: () => void }) {
  const t = useTranslation();
  return (
    <ToolbarActionGroup
      ariaLabel={t('desktop.workspace.settingsActions')}
      className="h-[var(--workspace-top-toolbar-height)] w-full justify-center"
      fullWidth
      orientation="vertical"
    >
      <WorkspaceRailTooltipButton
        className={`size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground ${WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME} data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground`}
        data-active={isSettingsOpen}
        icon={<Settings aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.workspace.settings')}
        onClick={onOpenSettings}
      />
    </ToolbarActionGroup>
  );
}

function useWorkspaceRailToolbarState({
  onOpenSettings,
  onRunRailAction,
  onStartClipboardImport,
  onStartImport
}: Pick<
  WorkspaceSideToolbarProps,
  'onOpenSettings' | 'onRunRailAction' | 'onStartClipboardImport' | 'onStartImport'
>) {
  const demoImport = useDemoMarkdownRailImport();
  const { isDemo } = useDemoRuntimeState();
  const rail = useWorkspaceRailSettings();
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const isVisibleDemoRailItem = (item: { commandId: string; visible: boolean }) =>
    item.visible && !(isDemo && item.commandId === APP_COMMAND_IDS.sendFeedback);
  const topItems = getWorkspaceRailSectionItems(rail.items, 'top').filter(isVisibleDemoRailItem);
  const bottomItems = getWorkspaceRailSectionItems(rail.items, 'bottom').filter(isVisibleDemoRailItem);

  function runRailCommand(commandId: string) {
    if (commandId === APP_COMMAND_IDS.importSingleFile) {
      if (demoImport.isDemo) {
        demoImport.fileInputRef.current?.click();
      } else {
        onStartImport();
      }
    } else if (commandId === APP_COMMAND_IDS.clipboardImport) {
      if (demoImport.isDemo) {
        void demoImport.importClipboardMarkdown();
      } else {
        onStartClipboardImport();
      }
    } else {
      onRunRailAction?.(commandId);
    }
  }

  function openRailManager() {
    setContextMenuPosition(null);
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory, 'rail');
    onOpenSettings();
  }

  return {
    bottomItems,
    contextMenuPosition,
    demoImport,
    openRailManager,
    rail,
    runRailCommand,
    setContextMenuPosition,
    topItems
  };
}

export function WorkspaceSideToolbar(props: WorkspaceSideToolbarProps) {
  const t = useTranslation();
  const state = useWorkspaceRailToolbarState(props);

  return (
    <AppToolbar
      aria-label={t('desktop.workspace.sideToolbar')}
      className="workspace-region-main-rail flex h-full w-[var(--workspace-rail-width)] flex-col"
      onContextMenu={(event) => {
        event.preventDefault();
        state.setContextMenuPosition({ left: event.clientX, top: event.clientY });
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center">
        <RailActionGroup
          ariaLabel={t('desktop.workspace.topRailActions')}
          items={state.topItems}
          onRun={state.runRailCommand}
        />
        <div className="flex-1" />
        <WorkspaceUpdateAction />
        <RailActionGroup
          ariaLabel={t('desktop.workspace.bottomRailActions')}
          items={state.bottomItems}
          onRun={state.runRailCommand}
        />
        {state.demoImport.isDemo ? <WorkspaceDemoRailBottomActions {...definedProps({ onRunRailAction: props.onRunRailAction })} /> : null}
        <WorkspaceThemeModeAction {...definedProps({ onRunRailAction: props.onRunRailAction })} />
        <SettingsAction isSettingsOpen={props.isSettingsOpen} onOpenSettings={props.onOpenSettings} />
      </div>
      {renderStudyDock({
        canStartStudyMode: props.canStartStudyMode,
        isStudyMode: props.isStudyMode,
        onToggleReviewSession: props.onToggleReviewSession,
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
      <input
        accept=".md,text/markdown,text/plain"
        className="hidden"
        multiple
        onChange={(event) => void state.demoImport.importMarkdownFiles(event.target.files)}
        ref={state.demoImport.fileInputRef}
        type="file"
      />
    </AppToolbar>
  );
}
