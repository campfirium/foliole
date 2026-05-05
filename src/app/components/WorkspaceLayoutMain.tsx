import type { CSSProperties } from 'react';
import { useState } from 'react';

import { SettingsPanel } from '../../features/settings/components/SettingsPanel';

import { WindowTitleBar } from './WindowTitleBar';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceLayoutGrid } from './WorkspaceLayoutGrid';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

function SettingsOverlay({ props }: { props: WorkspaceLayoutProps }) {
  if (!props.isSettingsOpen) {
    return null;
  }

  return (
    <SettingsPanel
      customUiFont={props.customUiFont}
      customInterfaceFont={props.customInterfaceFont}
      customMonospaceFont={props.customMonospaceFont}
      baseColorMode={props.baseColorMode}
      accentColorPreset={props.accentColorPreset}
      uiFontPreset={props.uiFontPreset}
      interfaceFontPreset={props.interfaceFontPreset}
      interfaceFontSize={props.interfaceFontSize}
      desiredRetention={props.reviewSchedulerSettings.desiredRetention}
      maximumIntervalDays={props.reviewSchedulerSettings.maximumIntervalDays}
      enableFuzz={props.reviewSchedulerSettings.enableFuzz}
      enableShortTerm={props.reviewSchedulerSettings.enableShortTerm}
      defaultPriority={props.reviewSchedulerSettings.pushQueue.defaultPriority}
      priorityRatio={props.reviewSchedulerSettings.pushQueue.priorityRatio}
      queueMixRatioReading={props.reviewSchedulerSettings.pushQueue.queueMixRatio.reading}
      queueMixRatioFsrs={props.reviewSchedulerSettings.pushQueue.queueMixRatio.fsrs}
      readingInitialIntervalMs={props.reviewSchedulerSettings.pushQueue.readingInitialIntervalMs}
      readingIntervalGrowthFactorMin={props.reviewSchedulerSettings.pushQueue.readingIntervalGrowthFactorRange.min}
      readingIntervalGrowthFactorMax={props.reviewSchedulerSettings.pushQueue.readingIntervalGrowthFactorRange.max}
      hotkeyItems={props.hotkeyItems}
      markdownSyntaxVisibility={props.markdownSyntaxVisibility}
      monospaceFontPreset={props.monospaceFontPreset}
      onClose={props.onCloseSettings}
      onBaseColorModeChange={props.onBaseColorModeChange}
      onAccentColorPresetChange={props.onAccentColorPresetChange}
      onAccentColorPresetReset={props.onAccentColorPresetReset}
      onUiFontPresetChange={props.onUiFontPresetChange}
      onCustomUiFontChange={props.onCustomUiFontChange}
      onCustomInterfaceFontChange={props.onCustomInterfaceFontChange}
      onInterfaceFontPresetChange={props.onInterfaceFontPresetChange}
      onCustomMonospaceFontChange={props.onCustomMonospaceFontChange}
      onInterfaceFontSizeChange={props.onInterfaceFontSizeChange}
      onInterfaceFontSizeReset={props.onInterfaceFontSizeReset}
      onDesiredRetentionChange={props.onDesiredRetentionChange}
      onDefaultPriorityChange={props.onDefaultPriorityChange}
      onMaximumIntervalDaysChange={props.onMaximumIntervalDaysChange}
      onEnableFuzzChange={props.onEnableFuzzChange}
      onEnableShortTermChange={props.onEnableShortTermChange}
      onPriorityRatioChange={props.onPriorityRatioChange}
      onQueueMixRatioReadingChange={props.onQueueMixRatioReadingChange}
      onQueueMixRatioFsrsChange={props.onQueueMixRatioFsrsChange}
      onReadingInitialIntervalDaysChange={props.onReadingInitialIntervalDaysChange}
      onReadingIntervalGrowthFactorMinChange={props.onReadingIntervalGrowthFactorMinChange}
      onReadingIntervalGrowthFactorMaxChange={props.onReadingIntervalGrowthFactorMaxChange}
      onMarkdownSyntaxVisibilityChange={props.onMarkdownSyntaxVisibilityChange}
      onMonospaceFontPresetChange={props.onMonospaceFontPresetChange}
      onHotkeyUpdate={props.onHotkeyUpdate}
      onHotkeyReset={props.onHotkeyReset}
      onHotkeyResetAll={props.onHotkeyResetAll}
    />
  );
}

function useWorkspaceMainView(props: WorkspaceLayoutProps) {
  const [isImportManagementOpen, setIsImportManagementOpen] = useState(false);
  const handleOpenImportManagement = () => {
    setIsImportManagementOpen(true);
  };
  const handleOpenNotesView = () => {
    setIsImportManagementOpen(false);
    props.onOpenNotesView();
  };
  const handleOpenTrashView = () => {
    setIsImportManagementOpen(false);
    props.onOpenTrashView();
  };
  const handleSelectNode = (nodeId: string) => {
    setIsImportManagementOpen(false);
    props.onSelectNode(nodeId);
  };

  return {
    handleOpenImportManagement,
    handleOpenNotesView,
    handleOpenTrashView,
    handleSelectNode,
    isImportManagementOpen
  };
}

export function WorkspaceLayoutMain(props: WorkspaceLayoutProps) {
  const [activeRightPanelId, setActiveRightPanelId] = useState<WorkspaceRightPanelId>('dev');
  const {
    handleOpenImportManagement,
    handleOpenNotesView,
    handleOpenTrashView,
    handleSelectNode,
    isImportManagementOpen
  } = useWorkspaceMainView(props);
  const workspaceGridStyle = {
    '--workspace-list-width': `${props.listWidth}px`,
    '--workspace-right-sidebar-width': `${props.rightSidebarWidth}px`
  } as CSSProperties;
  const documentNodeId = props.isViewingTrashNode ? props.selectedTrashNodeId : props.activeNodeId;
  const handleSelectRightPanel = (panelId: WorkspaceRightPanelId) => {
    setActiveRightPanelId(panelId);
    if (props.isRightSidebarCollapsed) {
      props.onToggleRightSidebarVisibility();
    }
  };

  return (
    <main aria-label="Foliole workspace" className="relative flex h-dvh flex-col overflow-hidden p-0" style={workspaceGridStyle}>
      {!props.isListCollapsed ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-border max-[1080px]:hidden"
          style={{ left: 'calc(40px + var(--workspace-list-width, 300px))' }}
        />
      ) : null}
      <WindowTitleBar
        activeRightPanelId={activeRightPanelId}
        isListCollapsed={props.isListCollapsed}
        isRightSidebarCollapsed={props.isRightSidebarCollapsed}
        isTrashViewOpen={props.isTrashViewOpen}
        listWidth={props.listWidth}
        onOpenNotesView={handleOpenNotesView}
        onOpenTrashView={handleOpenTrashView}
        onSelectRightPanel={handleSelectRightPanel}
        onToggleListVisibility={props.onToggleListVisibility}
        onToggleRightSidebarVisibility={props.onToggleRightSidebarVisibility}
        rightSidebarWidth={props.rightSidebarWidth}
      />
      <WorkspaceLayoutGrid
        activeRightPanelId={activeRightPanelId}
        documentNodeId={documentNodeId}
        isImportManagementOpen={isImportManagementOpen}
        onOpenImportManagement={handleOpenImportManagement}
        onSelectNode={handleSelectNode}
        props={props}
      />
      <SettingsOverlay props={props} />
    </main>
  );
}
