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
  return <AppContent />;
}
