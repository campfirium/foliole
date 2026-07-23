import type { ReactNode } from 'react';

import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { AppToolbar } from '../../shared/ui';

import {
  renderDefaultDocumentHeaderRightSlot,
  renderDocumentHeaderActions
} from './DocumentPanelHeaderActions';
import { DocumentPanelHeaderCenter } from './DocumentPanelHeaderCenter';
import {
  DocumentPanelHeaderNavigation,
  type DocumentPanelHeaderNavigationProps
} from './DocumentPanelHeaderNavigation';

export interface DocumentPanelHeaderProps {
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
  onRunDocumentCommand?: ((commandId: string) => void) | undefined;
  onSelectBacklinkNode: (nodeId: string) => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onToggleSourceUpdatePanel: () => void;
  priorityQuickSetShortcutLabel: string;
  reviewSchedulerSettings: ReviewSchedulerSettings;
  rightSlot?: ReactNode;
  showDocumentControls?: boolean;
  showPublishActions?: boolean;
  showSourceUpdateAction: boolean;
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
  const editorActions = renderDocumentHeaderActions({
    editorDisplayMode: args.editorDisplayMode,
    isFolderListView: args.isFolderListView,
    isSourceUpdatePanelOpen: args.isSourceUpdatePanelOpen,
    onToggleSourceUpdatePanel: args.onToggleSourceUpdatePanel,
    onRunDocumentCommand: args.onRunDocumentCommand,
    showDocumentControls,
    showPublishActions: args.showPublishActions ?? false,
    showSourceUpdateAction: args.showSourceUpdateAction,
    t: args.t,
    toggleEditorDisplayMode: args.toggleEditorDisplayMode
  });
  const rightSlot = args.rightSlot ?? (
    showDocumentControls ? renderDefaultDocumentHeaderRightSlot(args) : null
  );
  const navigationSlot = !args.isFolderListView ? <DocumentPanelHeaderNavigation {...navigationProps} /> : null;

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <DocumentPanelHeaderCenter
        activeNodeId={args.activeNodeId}
        editorActionsSlot={editorActions}
        isFolderListView={args.isFolderListView}
        navigationSlot={navigationSlot}
        nodesById={args.nodesById}
        onSelectBreadcrumbNode={args.onSelectBreadcrumbNode}
        rightSlot={rightSlot}
      />
    </div>
  );
}

export function DocumentPanelHeader(props: DocumentPanelHeaderProps) {
  const t = useTranslation();
  const { editorDisplayMode, toggleEditorDisplayMode } = useAppearanceSettings();

  return (
    <AppToolbar as="header" className="min-h-8">
      <h2 className="sr-only">{t('desktop.document.content')}</h2>
      {renderDocumentHeaderContent({
        ...props,
        editorDisplayMode,
        t,
        toggleEditorDisplayMode
      })}
    </AppToolbar>
  );
}
