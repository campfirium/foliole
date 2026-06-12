import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

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
  readDocumentHeaderCompactInput,
  resolveDocumentHeaderCompactMode
} from './documentPanelHeaderCompact';
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
  isCompact: boolean;
  editorDisplayMode: ReturnType<typeof useAppearanceSettings>['editorDisplayMode'];
  setHeaderElement: (element: HTMLDivElement | null) => void;
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
    showDocumentControls,
    showSourceUpdateAction: args.showSourceUpdateAction,
    t: args.t,
    toggleEditorDisplayMode: args.toggleEditorDisplayMode
  });
  const rightSlot = args.rightSlot ?? (
    showDocumentControls ? renderDefaultDocumentHeaderRightSlot(args) : null
  );
  const navigationSlot = !args.isFolderListView ? <DocumentPanelHeaderNavigation {...navigationProps} /> : null;

  return (
    <div className="relative flex min-w-0 flex-1 items-center" ref={args.setHeaderElement}>
      {!args.isCompact && navigationSlot ? (
        <div className="absolute left-4 top-1/2 flex min-w-0 -translate-y-1/2 items-center max-[1080px]:left-2">
          {navigationSlot}
        </div>
      ) : null}
      <DocumentPanelHeaderCenter
        activeNodeId={args.activeNodeId}
        compactEditorActionsSlot={args.isCompact ? editorActions : null}
        compactNavigationSlot={args.isCompact ? navigationSlot : null}
        isFolderListView={args.isFolderListView}
        nodesById={args.nodesById}
        onSelectBreadcrumbNode={args.onSelectBreadcrumbNode}
        rightSlot={rightSlot}
      />
      {!args.isCompact && editorActions ? (
        <div className="absolute right-4 top-1/2 flex min-w-0 -translate-y-1/2 items-center justify-end max-[1080px]:right-2">
          {editorActions}
        </div>
      ) : null}
    </div>
  );
}

function useDocumentHeaderCompactMode() {
  const [element, setHeaderElement] = useState<HTMLDivElement | null>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (!element) {
      return undefined;
    }
    const updateCompactMode = () => {
      setIsCompact(resolveDocumentHeaderCompactMode(readDocumentHeaderCompactInput(element)));
    };
    updateCompactMode();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateCompactMode);
      return () => window.removeEventListener('resize', updateCompactMode);
    }
    const observer = new ResizeObserver(updateCompactMode);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { isCompact, setHeaderElement };
}

export function DocumentPanelHeader(props: DocumentPanelHeaderProps) {
  const t = useTranslation();
  const { editorDisplayMode, toggleEditorDisplayMode } = useAppearanceSettings();
  const { isCompact, setHeaderElement } = useDocumentHeaderCompactMode();

  return (
    <AppToolbar as="header" className="min-h-8">
      <h2 className="sr-only">{t('desktop.document.content')}</h2>
      {renderDocumentHeaderContent({
        ...props,
        editorDisplayMode,
        isCompact,
        setHeaderElement,
        t,
        toggleEditorDisplayMode
      })}
    </AppToolbar>
  );
}
