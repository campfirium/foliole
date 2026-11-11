import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { definedProps } from '../shared/lib/definedProps';

import type { CompanionEditHistoryActionsProps } from './CompanionEditHistoryActions';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { ReadingActionsSheet } from './CompanionReadingSheets';
import { useCompanionArticleHandoff } from './useCompanionArticleHandoff';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;

export function ReadingActionsLayer(props: {
  editHistory?: CompanionEditHistoryActionsProps;
  actionsOpen: boolean;
  onOpenOutline?: () => void;
  onFindInDocument(): void;
  onOpenActions(open: boolean): void;
  onOpenReadingSheet(sheet: 'font' | 'info' | null): void;
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
  const articleHandoff = useCompanionArticleHandoff(
    canShare && props.actionsOpen ? readableArticle.nodeId : undefined,
    handoffContext.activity,
    () => props.onOpenActions(false)
  );
  return (
    <ReadingActionsSheet
      key={props.readableArticle.nodeId}
      onFindInDocument={props.onFindInDocument}
      onOpenChange={props.onOpenActions}
      onOpenReadingSheet={props.onOpenReadingSheet}
      open={props.actionsOpen}
      {...definedProps({
        editHistory: props.editHistory,
        priorityNodeId: props.readableArticle.isTrashed ? undefined : props.readableArticle.nodeId,
        onOpenOutline: props.onOpenOutline,
        onOpenClozeRemoval: props.onOpenClozeRemoval,
        articleHandoff,
        onRestoreFromTrash: props.readableArticle.isTrashed && restoreFromTrash
          ? () => restoreFromTrash(props.readableArticle.nodeId)
          : undefined
      })}
    />
  );
}
