import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
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
import { MoreOptionsIcon, SplitPanelIcon } from './DocumentPanelHeaderIcons';
import {
  DocumentPanelHeaderNavigation,
  type DocumentPanelHeaderNavigationProps
} from './DocumentPanelHeaderNavigation';
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
  showDocumentControls?: boolean;
  showSourceUpdateAction: boolean;
}

function SourceUpdateAction({
  isOpen,
  onToggle,
  t,
  visible
}: {
  isOpen: boolean;
  onToggle: () => void;
  t: Translate;
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
      label={t('desktop.document.toggleSourceUpdatePanel')}
      onClick={onToggle}
    />
  );
}

function renderHeaderActions(args: {
  editorDisplayMode: ReturnType<typeof useAppearanceSettings>['editorDisplayMode'];
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  onToggleSourceUpdatePanel: () => void;
  showSourceUpdateAction: boolean;
  showDocumentControls: boolean;
  toggleEditorDisplayMode: () => void;
  t: Translate;
}) {
  if (args.isFolderListView || !args.showDocumentControls) {
    return null;
  }

  return (
    <ToolbarActionGroup ariaLabel={args.t('desktop.document.editorActions')} className="justify-end">
      <SourceUpdateAction
        isOpen={args.isSourceUpdatePanelOpen}
        onToggle={args.onToggleSourceUpdatePanel}
        t={args.t}
        visible={args.showSourceUpdateAction}
      />
      <AppDropdownMenu>
        <AppDropdownMenuTrigger asChild>
          <AppIconButton
            className="inline-flex size-8 items-center justify-center rounded-[max(var(--radius-1),var(--radius-full))] text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            icon={<MoreOptionsIcon />}
            label={args.t('desktop.document.moreEditorOptions')}
          />
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="end" sideOffset={6}>
          <AppDropdownMenuItem onSelect={args.toggleEditorDisplayMode}>
            {args.editorDisplayMode === 'preview' ? args.t('desktop.document.switchToSource') : args.t('desktop.document.switchToLivePreview')}
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </ToolbarActionGroup>
  );
}

function buildNavigationProps(args: DocumentPanelHeaderProps): DocumentPanelHeaderNavigationProps {
  return {
    canGoBack: args.canGoBack,
    canGoForward: args.canGoForward,
    canGoParent: args.canGoParent,
    onGoBack: args.onGoBack,
    onGoForward: args.onGoForward,
    onGoParent: args.onGoParent
  };
}

function renderDocumentHeaderContent(args: DocumentPanelHeaderProps & {
  editorDisplayMode: ReturnType<typeof useAppearanceSettings>['editorDisplayMode'];
  t: Translate;
  toggleEditorDisplayMode: () => void;
}) {
  const navigationProps = buildNavigationProps(args);
  const showDocumentControls = args.showDocumentControls ?? true;

  return (
    <div className="relative flex min-w-0 flex-1 items-center [container-type:inline-size]">
      <div className="absolute left-0 top-1/2 flex min-w-0 -translate-y-1/2 items-center [@container(max-width:1040px)]:hidden">
        {!args.isFolderListView ? <DocumentPanelHeaderNavigation {...navigationProps} /> : null}
      </div>
      <DocumentPanelHeaderCenter
        activeNodeId={args.activeNodeId}
        compactNavigationSlot={!args.isFolderListView ? <DocumentPanelHeaderNavigation {...navigationProps} /> : null}
        isFolderListView={args.isFolderListView}
        nodesById={args.nodesById}
        onSelectBreadcrumbNode={args.onSelectBreadcrumbNode}
        rightSlot={!showDocumentControls ? null : (
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
        )}
      />
      <div className="absolute right-0 top-1/2 flex min-w-0 -translate-y-1/2 items-center justify-end">
        {renderHeaderActions({
          editorDisplayMode: args.editorDisplayMode,
          isFolderListView: args.isFolderListView,
          isSourceUpdatePanelOpen: args.isSourceUpdatePanelOpen,
          onToggleSourceUpdatePanel: args.onToggleSourceUpdatePanel,
          showDocumentControls,
          showSourceUpdateAction: args.showSourceUpdateAction,
          t: args.t,
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
  showDocumentControls = true,
  showSourceUpdateAction
}: DocumentPanelHeaderProps) {
  const t = useTranslation();
  const { editorDisplayMode, toggleEditorDisplayMode } = useAppearanceSettings();

  return (
    <AppToolbar as="header" className="min-h-8 pl-4 pr-4 max-[1080px]:px-2">
      <h2 className="sr-only">{t('desktop.document.content')}</h2>
      {renderDocumentHeaderContent({
        activeNodeId,
        backlinks,
        canGoBack,
        canGoForward,
        canGoParent,
        editableNodeId,
        ...(folderItemCountLabel !== undefined ? { folderItemCountLabel } : {}),
        editorDisplayMode,
        ...(folderListToolbar !== undefined ? { folderListToolbar } : {}),
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
        ...(showDocumentControls !== undefined ? { showDocumentControls } : {}),
        showSourceUpdateAction,
        t,
        toggleEditorDisplayMode
      })}
    </AppToolbar>
  );
}
