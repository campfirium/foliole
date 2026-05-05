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
  return (
    <AppearanceSettingsProvider>
      <MouseGestureSettingsProvider>
        <ReviewSchedulerSettingsProvider>
          <AppContent />
        </ReviewSchedulerSettingsProvider>
      </MouseGestureSettingsProvider>
    </AppearanceSettingsProvider>
  );
}
