import type { Node } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppIconButton,
  AppToolbar,
  ToolbarActionGroup
} from '../../shared/ui';

import { DocumentPanelHeaderCenter } from './DocumentPanelHeaderCenter';

interface DocumentPanelHeaderProps {
  activeNodeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  editableNodeId: string | null;
  folderListToolbar?: JSX.Element | null;
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  nodesById: Record<string, Node>;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onNodePriorityChange: (nodeId: string, priority: number | null) => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onToggleSourceUpdatePanel: () => void;
  priorityQuickSetShortcutLabel: string;
  reviewSchedulerSettings: ReviewSchedulerSettings;
  showSourceUpdateAction: boolean;
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

function SourceUpdateAction({
  isOpen,
  onToggle,
  visible
}: {
  isOpen: boolean;
  onToggle: () => void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }
  return (
    <AppIconButton
      aria-pressed={isOpen}
      className="inline-flex size-8 items-center justify-center rounded-[max(var(--radius-1),var(--radius-full))] text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
      data-active={isOpen}
      icon={<SplitPanelIcon />}
      label="Toggle source update panel"
      onClick={onToggle}
    />
  );
}

function renderHeaderActions(args: {
  editorDisplayMode: ReturnType<typeof useAppearanceSettings>['editorDisplayMode'];
  folderListToolbar?: JSX.Element | null;
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  onToggleSourceUpdatePanel: () => void;
  showSourceUpdateAction: boolean;
  toggleEditorDisplayMode: () => void;
}) {
  if (args.isFolderListView) {
    return args.folderListToolbar ? <div className="shrink-0">{args.folderListToolbar}</div> : null;
  }

  return (
    <ToolbarActionGroup ariaLabel="Document editor actions">
      <SourceUpdateAction
        isOpen={args.isSourceUpdatePanelOpen}
        onToggle={args.onToggleSourceUpdatePanel}
        visible={args.showSourceUpdateAction}
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
          <AppDropdownMenuItem onSelect={args.toggleEditorDisplayMode}>
            {args.editorDisplayMode === 'preview' ? 'Switch to Source mode' : 'Switch to Live Preview mode'}
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </ToolbarActionGroup>
  );
}

export function DocumentPanelHeader({
  activeNodeId,
  canGoBack,
  canGoForward,
  canGoParent,
  editableNodeId,
  folderListToolbar,
  isFolderListView,
  isSourceUpdatePanelOpen,
  nodesById,
  onGoBack,
  onGoForward,
  onGoParent,
  onNodePriorityChange,
  onSelectBreadcrumbNode,
  onToggleSourceUpdatePanel,
  priorityQuickSetShortcutLabel,
  reviewSchedulerSettings,
  showSourceUpdateAction
}: DocumentPanelHeaderProps) {
  const { editorDisplayMode, toggleEditorDisplayMode } = useAppearanceSettings();

  return (
    <AppToolbar as="header" className="min-h-[40px] gap-2 px-3">
      <h2 className="sr-only">Content</h2>
      {!isFolderListView ? (
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
      ) : null}
      <DocumentPanelHeaderCenter
        activeNodeId={activeNodeId}
        defaultPriority={reviewSchedulerSettings.pushQueue.defaultPriority}
        editableNodeId={editableNodeId}
        isFolderListView={isFolderListView}
        nodesById={nodesById}
        onNodePriorityChange={onNodePriorityChange}
        onSelectBreadcrumbNode={onSelectBreadcrumbNode}
        priorityQuickSetShortcutLabel={priorityQuickSetShortcutLabel}
      />
      {renderHeaderActions({
        editorDisplayMode,
        folderListToolbar,
        isFolderListView,
        isSourceUpdatePanelOpen,
        onToggleSourceUpdatePanel,
        showSourceUpdateAction,
        toggleEditorDisplayMode
      })}
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
