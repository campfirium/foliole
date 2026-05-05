import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
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

import { DocumentPanelHeaderBacklinksMenu } from './DocumentPanelHeaderBacklinksMenu';
import { DocumentPanelHeaderCenter } from './DocumentPanelHeaderCenter';
import { ArrowLeftIcon, ArrowRightIcon, MoreOptionsIcon, SplitPanelIcon } from './DocumentPanelHeaderIcons';
import { DocumentPriorityControl } from './DocumentPriorityControl';

interface DocumentPanelHeaderProps {
  activeNodeId: string | null;
  backlinks: BacklinkItem[];
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  editableNodeId: string | null;
  folderItemCountLabel?: string | null;
  folderListToolbar?: JSX.Element | null;
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  nodesById: Record<string, Node>;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onNodePriorityChange: (nodeId: string, priority: number | null) => void;
  onSelectBacklinkNode: (nodeId: string) => void;
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
    <ToolbarActionGroup ariaLabel="Document editor actions" className="justify-end">
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

function renderDocumentHeaderContent(args: DocumentPanelHeaderProps & {
  editorDisplayMode: ReturnType<typeof useAppearanceSettings>['editorDisplayMode'];
  toggleEditorDisplayMode: () => void;
}) {
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2">
      <div className="flex min-w-0 items-center">
        {!args.isFolderListView ? (
          <ToolbarActionGroup ariaLabel="Document navigation actions">
            <NavigationButtons
              canGoBack={args.canGoBack}
              canGoForward={args.canGoForward}
              canGoParent={args.canGoParent}
              onGoBack={args.onGoBack}
              onGoForward={args.onGoForward}
              onGoParent={args.onGoParent}
            />
          </ToolbarActionGroup>
        ) : null}
      </div>
      <DocumentPanelHeaderCenter
        activeNodeId={args.activeNodeId}
        folderItemCountLabel={args.folderItemCountLabel}
        isFolderListView={args.isFolderListView}
        nodesById={args.nodesById}
        onSelectBreadcrumbNode={args.onSelectBreadcrumbNode}
        rightSlot={
          <>
            <DocumentPanelHeaderBacklinksMenu backlinks={args.backlinks} onSelectNode={args.onSelectBacklinkNode} />
            <DocumentPriorityControl
              activeNodeId={args.activeNodeId}
              defaultPriority={args.reviewSchedulerSettings.pushQueue.defaultPriority}
              editableNodeId={args.editableNodeId}
              nodesById={args.nodesById}
              onPriorityChange={args.onNodePriorityChange}
              shortcutLabel={args.priorityQuickSetShortcutLabel}
            />
          </>
        }
      />
      <div className="flex min-w-0 items-center justify-end">
        {renderHeaderActions({
          editorDisplayMode: args.editorDisplayMode,
          folderListToolbar: args.folderListToolbar,
          isFolderListView: args.isFolderListView,
          isSourceUpdatePanelOpen: args.isSourceUpdatePanelOpen,
          onToggleSourceUpdatePanel: args.onToggleSourceUpdatePanel,
          showSourceUpdateAction: args.showSourceUpdateAction,
          toggleEditorDisplayMode: args.toggleEditorDisplayMode
        })}
      </div>
    </div>
  );
}

export function DocumentPanelHeader({
  activeNodeId,
  backlinks,
  canGoBack,
  canGoForward,
  canGoParent,
  editableNodeId,
  folderItemCountLabel,
  folderListToolbar,
  isFolderListView,
  isSourceUpdatePanelOpen,
  nodesById,
  onGoBack,
  onGoForward,
  onGoParent,
  onNodePriorityChange,
  onSelectBacklinkNode,
  onSelectBreadcrumbNode,
  onToggleSourceUpdatePanel,
  priorityQuickSetShortcutLabel,
  reviewSchedulerSettings,
  showSourceUpdateAction
}: DocumentPanelHeaderProps) {
  const { editorDisplayMode, toggleEditorDisplayMode } = useAppearanceSettings();

  return (
    <AppToolbar as="header" className="min-h-[var(--workspace-top-toolbar-height)] px-4">
      <h2 className="sr-only">Content</h2>
      {renderDocumentHeaderContent({
        activeNodeId,
        backlinks,
        canGoBack,
        canGoForward,
        canGoParent,
        editableNodeId,
        folderItemCountLabel,
        editorDisplayMode,
        folderListToolbar,
        isFolderListView,
        isSourceUpdatePanelOpen,
        nodesById,
        onGoBack,
        onGoForward,
        onGoParent,
        onNodePriorityChange,
        onSelectBacklinkNode,
        onSelectBreadcrumbNode,
        onToggleSourceUpdatePanel,
        priorityQuickSetShortcutLabel,
        reviewSchedulerSettings,
        showSourceUpdateAction,
        toggleEditorDisplayMode
      })}
    </AppToolbar>
  );
}
