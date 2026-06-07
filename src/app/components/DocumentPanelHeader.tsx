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
  onSelectBacklinkNode: (nodeId: string) => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onToggleSourceUpdatePanel: () => void;
  priorityQuickSetShortcutLabel: string;
  reviewSchedulerSettings: ReviewSchedulerSettings;
  rightSlot?: ReactNode;
  showDocumentControls?: boolean;
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
  const rightSlot = args.rightSlot ?? (
    showDocumentControls ? renderDefaultDocumentHeaderRightSlot(args) : null
  );

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
        rightSlot={rightSlot}
      />
      <div className="absolute right-0 top-1/2 flex min-w-0 -translate-y-1/2 items-center justify-end">
        {renderDocumentHeaderActions({
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

export function DocumentPanelHeader(props: DocumentPanelHeaderProps) {
  const t = useTranslation();
  const { editorDisplayMode, toggleEditorDisplayMode } = useAppearanceSettings();

  return (
    <AppToolbar as="header" className="min-h-8 pl-4 pr-4 max-[1080px]:px-2">
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
