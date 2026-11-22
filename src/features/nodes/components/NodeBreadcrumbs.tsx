import { buildBreadcrumbDisplayPath } from '../../../shared/lib/breadcrumbDisplayPath';
import { capBreadcrumbLabel } from '../../../shared/lib/breadcrumbLabel';
import { resolveClozeAnswerTexts, toBreadcrumbTitleText } from '../../../shared/lib/breadcrumbTitleText';
import { useLocalization } from '../../../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../../../shared/localization/systemEntryNames';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { AppBreadcrumb } from '@/shared/ui';

interface NodeBreadcrumbsProps {
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
}

/** Ancestors of the open node; the node itself is the document title and is not repeated here. */
export function NodeBreadcrumbs({ activeNodeId, nodesById, onSelectNode }: NodeBreadcrumbsProps) {
  const { locale, t } = useLocalization();
  const sourceItems = buildBreadcrumbDisplayPath(activeNodeId, nodesById, {
    untitledLabel: t('desktop.search.context.untitled')
  });
  const hiddenAnswers = resolveClozeAnswerTexts(activeNodeId ? nodesById[activeNodeId] : null);
  const items = sourceItems.map((item) => {
    const title = toBreadcrumbTitleText(resolveNodeDisplayTitle(locale, item.id, nodesById[item.id]?.title.trim() || item.title), hiddenAnswers);
    return { id: item.id, label: capBreadcrumbLabel(title), title };
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <AppBreadcrumb
      ariaLabel={t('shared.breadcrumb.aria')}
      items={items}
      onSelect={(id) => onSelectNode(sourceItems.find((item) => item.id === id)?.targetNodeId ?? id)}
    />
  );
}
