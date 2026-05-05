import { IconButton } from '../../shared/ui';

interface WorkspaceToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
}

export function WorkspaceToolbar({
  canGoBack,
  canGoForward,
  canGoParent,
  onGoBack,
  onGoForward,
  onGoParent
}: WorkspaceToolbarProps) {
  return (
    <section aria-label="Workspace toolbar" className="workspace-toolbar">
      <div className="workspace-toolbar-group">
        <IconButton disabled={!canGoBack} icon="←" label="Go back" onClick={onGoBack} />
        <IconButton disabled={!canGoForward} icon="→" label="Go forward" onClick={onGoForward} />
        <IconButton disabled={!canGoParent} icon="↑" label="Go to parent node" onClick={onGoParent} />
      </div>
    </section>
  );
}
