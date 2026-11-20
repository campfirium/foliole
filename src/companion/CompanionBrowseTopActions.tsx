import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';

import { resolveTopicFocusPresentation } from '../features/nodes/components/topicFocusPresentation';
import type { FolderListSortDirection, FolderListSortKey } from '../features/nodes/model/folderListOrdering';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { supportsCompanionNodeMutationSurface } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { useDismissedTopicVisibility } from '../shared/platform/runtime/useDismissedTopicVisibility';

import type { CompanionBrowsePage } from './CompanionBrowseContainerMenu';
import { CompanionBrowseMenuSheet, type CompanionBrowseDiveActions } from './CompanionBrowseMenuSheet';
import { CompanionTopActionButton } from './CompanionTopActionButton';

export function CompanionBrowseTopActions(props: {
  page: CompanionBrowsePage;
  diveActions?: CompanionBrowseDiveActions | undefined;
  menuTitle?: string;
  onChangeSortDirection(sortDirection: FolderListSortDirection): void;
  onChangeSortKey(sortKey: FolderListSortKey): void;
  onOpenCapture(): void;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  const t = useTranslation();
  const { toggleDismissedTopicsVisibility, viewHideDismissedTopics } = useDismissedTopicVisibility();
  // Topic focus only filters ordinary folders and the Browse list; indexes, Dives and Trash have nothing it hides.
  const showTopicFocus = props.page.kind === 'folder' || props.page.kind === 'recent';
  const topicFocusActive = showTopicFocus && viewHideDismissedTopics;
  const { icon, labelKey } = resolveTopicFocusPresentation(topicFocusActive);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {props.page.kind !== 'trash' && supportsCompanionNodeMutationSurface('quick-capture') ? (
        <CompanionTopActionButton
          icon={Plus}
          label={t('companion.capture.title')}
          onClick={props.onOpenCapture}
          testId="companion-capture-open"
        />
      ) : null}
      {showTopicFocus && <CompanionTopActionButton
        icon={icon}
        label={t(labelKey)}
        onClick={toggleDismissedTopicsVisibility}
        pressed={topicFocusActive}
      />}
      <CompanionTopActionButton icon={MoreHorizontal} label={t('companion.browse.more')} onClick={() => setIsMenuOpen(true)} />
      <CompanionBrowseMenuSheet
        page={props.page}
        diveActions={props.diveActions}
        onChangeSortDirection={props.onChangeSortDirection}
        onChangeSortKey={props.onChangeSortKey}
        onOpenChange={setIsMenuOpen}
        open={isMenuOpen}
        menuTitle={props.menuTitle ?? props.diveActions?.dive.title ?? t('companion.browse.title')}
        sortDirection={props.sortDirection}
        sortKey={props.sortKey}
      />
    </div>
  );
}
