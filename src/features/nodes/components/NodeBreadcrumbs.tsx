import { buildBreadcrumbDisplayPath } from '../../../shared/lib/breadcrumbDisplayPath';
import { useLocalization } from '../../../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../../../shared/localization/systemEntryNames';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { AppBreadcrumb } from '@/shared/ui';

interface NodeBreadcrumbsProps {
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
}

export function NodeBreadcrumbs({ activeNodeId, nodesById, onSelectNode }: NodeBreadcrumbsProps) {
  const { locale, t } = useLocalization();
  const sourceItems = buildBreadcrumbDisplayPath(activeNodeId, nodesById, {
    untitledLabel: t('desktop.search.context.untitled')
  });
  const items = sourceItems.map((item) => ({
    id: item.id,
    label: resolveNodeDisplayTitle(locale, item.id, item.title)
  }));

  if (items.length === 0) {
    return null;
  }

  return (
    <AppBreadcrumb
      ariaLabel={t('shared.breadcrumb.aria')}
      items={items}
      onSelect={(id) => {
        const selectedItem = sourceItems.find((item) => item.id === id);
        onSelectNode(selectedItem?.targetNodeId ?? id);
      }}
    />
  );
}
