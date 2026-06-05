import { buildBreadcrumbDisplayPath } from '../../../shared/lib/breadcrumbDisplayPath';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { AppBreadcrumb } from '@/shared/ui';

interface NodeBreadcrumbsProps {
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
}

export function NodeBreadcrumbs({ activeNodeId, nodesById, onSelectNode }: NodeBreadcrumbsProps) {
  const t = useTranslation();
  const sourceItems = buildBreadcrumbDisplayPath(activeNodeId, nodesById, {
    untitledLabel: t('desktop.search.context.untitled')
  });
  const items = sourceItems.map((item) => ({
    id: item.id,
    label: item.title
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
