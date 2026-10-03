import { definedProps } from '../shared/lib/definedProps';

import { ReadingActionsSheet } from './CompanionReadingSheets';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;

export function ReadingActionsLayer(props: {
  actionsOpen: boolean;
  onFindInDocument(): void;
  onOpenActions(open: boolean): void;
  onOpenReadingSheet(sheet: 'font' | 'highlight' | 'info' | null): void;
  onOpenClozeRemoval?: () => void;
  onRestoreFromTrash?: (nodeId: string) => Promise<void> | void;
  readableArticle: ReadableArticle;
}) {
  const restoreFromTrash = props.onRestoreFromTrash;
  return (
    <ReadingActionsSheet
      key={props.readableArticle.nodeId}
      onFindInDocument={props.onFindInDocument}
      onOpenChange={props.onOpenActions}
      onOpenReadingSheet={props.onOpenReadingSheet}
      open={props.actionsOpen}
      {...definedProps({
        onOpenClozeRemoval: props.onOpenClozeRemoval,
        onRestoreFromTrash: props.readableArticle.isTrashed && restoreFromTrash
          ? () => restoreFromTrash(props.readableArticle.nodeId)
          : undefined
      })}
    />
  );
}
