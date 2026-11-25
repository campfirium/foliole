import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { definedProps } from '../shared/lib/definedProps';

import { useCompanionBacklinksSheet } from './CompanionBacklinksSheet';
import type { CompanionEditHistoryActionsProps } from './CompanionEditHistoryActions';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { ReadingActionsSheet } from './CompanionReadingSheets';
import { useCompanionArticleHandoff } from './useCompanionArticleHandoff';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionPdfSave } from './useCompanionAttachmentSave';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;

export function ReadingActionsLayer(props: {
  editHistory?: CompanionEditHistoryActionsProps;
  actionsOpen: boolean;
  onOpenOutline?: () => void;
  onOpenBacklinkNode?: (nodeId: string) => void;
  onFindInDocument(): void;
  onOpenActions(open: boolean): void;
  onOpenReadingSheet(sheet: 'font' | null): void;
  onOpenClozeRemoval?: () => void;
  handoffContext: {
    activity?: CompanionReadingActivity | undefined;
    snapshot?: WorkspaceSnapshot | null;
    isContentEditing: boolean;
    isReviewItem?: boolean;
  };
  onRestoreFromTrash?: (nodeId: string) => Promise<void> | void;
  readableArticle: ReadableArticle;
}) {
  const restoreFromTrash = props.onRestoreFromTrash;
  const { handoffContext, readableArticle } = props;
  const node = handoffContext.snapshot?.nodesById[readableArticle.nodeId];
  const canShare = node?.kind === 'topic' && !node.anchorLink && !readableArticle.isTrashed &&
    !handoffContext.isReviewItem && (readableArticle.bodyStatus === 'ready' || handoffContext.isContentEditing);
  const shareNodeId = canShare && props.actionsOpen ? readableArticle.nodeId : undefined;
  const closeActions = () => props.onOpenActions(false);
  const articleHandoff = useCompanionArticleHandoff(shareNodeId, handoffContext.activity, closeActions);
  const articleCopy = useCompanionArticleHandoff(shareNodeId, handoffContext.activity, closeActions, 'copy');
  const pdfSave = useCompanionPdfSave(props.actionsOpen && !readableArticle.isTrashed ? readableArticle : null, closeActions);
  const backlinks = useCompanionBacklinksSheet({ activity: handoffContext.activity, nodeId: readableArticle.nodeId, snapshot: handoffContext.snapshot, onOpenNode: props.onOpenBacklinkNode, disabled: readableArticle.isTrashed });
  return (<>
    <ReadingActionsSheet
      key={readableArticle.nodeId}
      nodeId={readableArticle.nodeId}
      onFindInDocument={props.onFindInDocument}
      onOpenChange={props.onOpenActions}
      onOpenReadingSheet={props.onOpenReadingSheet}
      open={props.actionsOpen} showEditorDisplayModeToggle={handoffContext.isContentEditing}
      title={readableArticle.title}
      {...definedProps({
        editHistory: props.editHistory,
        priorityNodeId: props.readableArticle.isTrashed ? undefined : props.readableArticle.nodeId,
        onOpenOutline: props.onOpenOutline,
        onOpenBacklinks: backlinks.openSheet,
        onOpenClozeRemoval: props.onOpenClozeRemoval,
        articleHandoff,
        articleCopy,
        pdfSave,
        onRestoreFromTrash: props.readableArticle.isTrashed && restoreFromTrash
          ? () => restoreFromTrash(props.readableArticle.nodeId)
          : undefined
      })}
    />
    {backlinks.sheet}
  </>);
}
