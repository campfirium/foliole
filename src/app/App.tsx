import type { CSSProperties } from 'react';
import { useEffect } from 'react';

import { AppearanceSettingsProvider } from '../features/settings/context/AppearanceSettingsProvider';
import { HotkeySettingsProvider } from '../features/settings/context/HotkeySettingsProvider';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { ReviewSchedulerSettingsProvider } from '../features/settings/context/ReviewSchedulerSettingsProvider';
import { readPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import { installWorkspaceDebugBridge } from '../shared/testing/workspaceDebugBridge';

import { CommandPalette } from './components/CommandPalette';
import { GoToNodePalette } from './components/GoToNodePalette';
import { SearchPalette } from './components/SearchPalette';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useAppController } from './hooks/useAppController';
import { useWorkspaceHydration } from './hooks/useWorkspaceHydration';

function AppBootingShell() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading workspace"
      className="flex min-h-screen flex-col overflow-hidden bg-background text-foreground"
      role="status"
    >
      <AppBootingTitleBar />
      <AppBootingWorkspaceShell />
    </div>
  );
}

function AppBootingTitleBar() {
  return (
    <div className="window-titlebar">
      <div className="window-titlebar-left-zone" data-collapsed="false">
        <div className="h-full w-full" />
      </div>
      <div className="window-titlebar-drag-fill" />
      <div className="window-titlebar-right-anchor-shell" style={{ '--workspace-right-sidebar-width': '320px' } as CSSProperties}>
        <div className="h-full w-full" />
      </div>
      <div className="window-titlebar-controls" />
    </div>
  );
}

function AppBootingWorkspaceShell() {
  return (
    <div className="grid min-h-0 flex-1 overflow-hidden max-[1080px]:grid-cols-1" style={{ gridTemplateColumns: '40px minmax(0, 1fr)' }}>
      <div className="border-r border-border bg-bg-panel max-[1080px]:hidden" />
      <div className="min-h-0 min-w-0 overflow-hidden">
        <div className="grid h-full min-h-0 overflow-hidden [grid-template-columns:minmax(0,300px)_1px_minmax(0,1fr)_1px_minmax(0,320px)] max-[1080px]:grid-cols-1 max-[1080px]:grid-rows-[minmax(0,34dvh)_minmax(0,1fr)]">
          <AppBootingListPanel />
          <div className="bg-border max-[1080px]:hidden" />
          <AppBootingMainPanel />
          <div className="bg-border max-[1280px]:hidden" />
          <AppBootingRightPanel />
        </div>
      </div>
    </div>
  );
}

function AppBootingListPanel() {
  return <aside className="min-h-0 bg-bg-panel" />;
}

function AppBootingMainPanel() {
  return (
    <main className="flex min-h-0 flex-col bg-canvas">
      <div className="border-b border-border px-6 py-4" />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-10 py-10">
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            aria-label="Loading indicator"
            className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground/55"
          />
        </div>
      </div>
    </main>
  );
}

function AppBootingRightPanel() {
  return <aside className="min-h-0 bg-bg-panel max-[1280px]:hidden" />;
}

function AppContent() {
  const controller = useAppController();

  useEffect(() => {
    installWorkspaceDebugBridge();
    readPerformanceDiagnosticsProbe();
  }, []);

  return (
    <HotkeySettingsProvider {...controller.hotkeySettings}>
      <>
        <WorkspaceLayout {...controller.layoutProps} />
        <CommandPalette {...controller.paletteState} />
        <SearchPalette {...controller.searchState} />
        <GoToNodePalette {...controller.goToNodeState} />
        <GoToNodePalette
          {...controller.moveToNodeState}
          dialogLabel="Move to"
          emptyLabel="Search destinations"
          inputLabel="Move to"
          noResultsLabel="No matching destinations"
          onSelectNode={controller.moveToNodeState.onOpenNode}
          placeholder="Type a title..."
        />
      </>
    </HotkeySettingsProvider>
  );
}

export function App() {
  const isWorkspaceHydrated = useWorkspaceHydration();

  return (
    <AppearanceSettingsProvider>
      <MouseGestureSettingsProvider>
        <ReviewSchedulerSettingsProvider>
          {isWorkspaceHydrated ? <AppContent /> : <AppBootingShell />}
        </ReviewSchedulerSettingsProvider>
      </MouseGestureSettingsProvider>
    </AppearanceSettingsProvider>
  );
}
