import { AppearanceSettingsProvider } from '../features/settings/context/AppearanceSettingsProvider';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';

import { CommandPalette } from './components/CommandPalette';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useAppController } from './hooks/useAppController';

function AppContent() {
  const controller = useAppController();
  return (
    <>
      <WorkspaceLayout {...controller.layoutProps} />
      <CommandPalette {...controller.paletteState} />
    </>
  );
}

export function App() {
  return (
    <AppearanceSettingsProvider>
      <MouseGestureSettingsProvider>
        <AppContent />
      </MouseGestureSettingsProvider>
    </AppearanceSettingsProvider>
  );
}
