import { AppearanceSettingsProvider } from '../features/settings/context/AppearanceSettingsProvider';
import { HotkeySettingsProvider } from '../features/settings/context/HotkeySettingsProvider';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { ReviewSchedulerSettingsProvider } from '../features/settings/context/ReviewSchedulerSettingsProvider';

import { CommandPalette } from './components/CommandPalette';
import { GoToNodePalette } from './components/GoToNodePalette';
import { SearchPalette } from './components/SearchPalette';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useAppController } from './hooks/useAppController';

function AppContent() {
  const controller = useAppController();
  return (
    <HotkeySettingsProvider {...controller.hotkeySettings}>
      <>
        <WorkspaceLayout {...controller.layoutProps} />
        <CommandPalette {...controller.paletteState} />
        <SearchPalette {...controller.searchState} />
        <GoToNodePalette {...controller.goToNodeState} />
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
