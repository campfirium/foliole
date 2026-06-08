import type { ReactNode } from 'react';

import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppIconButton,
  ToolbarActionGroup
} from '../../shared/ui';

import { DocumentPanelHeaderBacklinksMenu } from './DocumentPanelHeaderBacklinksMenu';
import { MoreOptionsIcon, SplitPanelIcon } from './DocumentPanelHeaderIcons';
import { DocumentPriorityControl } from './DocumentPriorityControl';

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
      className="text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground"
      data-active={isOpen}
      icon={<SplitPanelIcon />}
      label={t('desktop.document.toggleSourceUpdatePanel')}
      onClick={onToggle}
    />
  );
}

export function renderDefaultDocumentHeaderRightSlot(args: {
  activeNodeId: string | null;
  backlinks: BacklinkItem[];
  editableNodeId: string | null;
  nodesById: Record<string, Node>;
  onNodePriorityChange: (nodeId: string, priority: number | null) => void;
  onSelectBacklinkNode: (nodeId: string) => void;
  priorityQuickSetShortcutLabel: string;
  reviewSchedulerSettings: ReviewSchedulerSettings;
}) {
  return (
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
  );
}

export function renderDocumentHeaderActions(args: {
  editorDisplayMode: ReturnType<typeof useAppearanceSettings>['editorDisplayMode'];
  isFolderListView: boolean;
  isSourceUpdatePanelOpen: boolean;
  onToggleSourceUpdatePanel: () => void;
  showSourceUpdateAction: boolean;
  showDocumentControls: boolean;
  toggleEditorDisplayMode: () => void;
  t: Translate;
}): ReactNode {
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
            className="text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
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
