import { NodeBreadcrumbs } from '../../features/nodes/components/NodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppIconButton,
  AppToolbar,
  ToolbarActionGroup
} from '../../shared/ui';

interface DocumentPanelHeaderProps {
  activeNodeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  isSplitPanelOpen: boolean;
  nodesById: Record<string, Node>;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onSelectNode: (nodeId: string) => void;
  onToggleSplitPanel: () => void;
}

interface NavigationButtonsProps {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
}

function NavigationButtons({ canGoBack, canGoForward, canGoParent, onGoBack, onGoForward, onGoParent }: NavigationButtonsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <AppIconButton className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground" disabled={!canGoBack} icon={<ArrowLeftIcon />} label="Go back" onClick={onGoBack} />
      <AppIconButton className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground" disabled={!canGoForward} icon={<ArrowRightIcon />} label="Go forward" onClick={onGoForward} />
      <button aria-label="Go to parent node" className="sr-only" disabled={!canGoParent} onClick={onGoParent} type="button">
        Go to parent node
      </button>
    </div>
  );
}

export function DocumentPanelHeader({
  activeNodeId,
  canGoBack,
  canGoForward,
  canGoParent,
  isSplitPanelOpen,
  nodesById,
  onGoBack,
  onGoForward,
  onGoParent,
  onSelectNode,
  onToggleSplitPanel
}: DocumentPanelHeaderProps) {
  const { editorDisplayMode, toggleEditorDisplayMode } = useAppearanceSettings();

  return (
    <AppToolbar as="header" className="min-h-[40px] gap-2 px-3">
      <h2 className="sr-only">Content</h2>
      <ToolbarActionGroup ariaLabel="Document navigation actions">
        <NavigationButtons
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          canGoParent={canGoParent}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onGoParent={onGoParent}
        />
      </ToolbarActionGroup>
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full [width:min(100%,var(--document-max-width))]">
          <NodeBreadcrumbs activeNodeId={activeNodeId} nodesById={nodesById} onSelectNode={onSelectNode} />
        </div>
      </div>
      <ToolbarActionGroup ariaLabel="Document editor actions">
        <AppIconButton
          aria-pressed={isSplitPanelOpen}
          className="inline-flex size-8 items-center justify-center rounded-[max(var(--radius-1),var(--radius-full))] text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
          data-active={isSplitPanelOpen}
          icon={<SplitPanelIcon />}
          label="Toggle split panel"
          onClick={onToggleSplitPanel}
        />
        <AppDropdownMenu>
          <AppDropdownMenuTrigger asChild>
            <AppIconButton
              className="inline-flex size-8 items-center justify-center rounded-[max(var(--radius-1),var(--radius-full))] text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
              icon={<MoreOptionsIcon />}
              label="More editor options"
            />
          </AppDropdownMenuTrigger>
          <AppDropdownMenuContent align="end" sideOffset={6}>
            <AppDropdownMenuItem onSelect={toggleEditorDisplayMode}>
              {editorDisplayMode === 'preview' ? 'Switch to Source mode' : 'Switch to Live Preview mode'}
            </AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      </ToolbarActionGroup>
    </AppToolbar>
  );
}

function MoreOptionsIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 16 16">
      <circle cx="4" cy="8" r="1.1" fill="currentColor" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function SplitPanelIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 16 16">
      <rect
        x="2.1"
        y="2.35"
        width="11.8"
        height="11.3"
        rx="1.55"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.05"
      />
      <path d="M8 2.9v10.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.05" />
      <path d="M2.7 5.2h10.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.05" opacity="0.75" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 16 16">
      <path d="M12.4 8H4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.05" />
      <path
        d="M7.6 5.2 4.8 8l2.8 2.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 16 16">
      <path d="M3.6 8h7.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.05" />
      <path
        d="m8.4 5.2 2.8 2.8-2.8 2.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  );
}
