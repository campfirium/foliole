import { ArrowRightLeft } from 'lucide-react';

import { isManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import { NodeContextMenuItem } from '../../features/nodes/components/nodeListContextMenuPresentation';
import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { getDiveRepository } from '../../shared/platform/desktop/diveRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { convertWorkspaceDiveDirectory } from './workspaceDiveMutation';

export function ConvertDiveDirectoryMenuItem(props: { nodeId: string; target: 'dive' | 'index'; onClose: () => void }) {
  const t = useTranslation();
  const eligible = useWorkspaceStore(state => {
    if (props.target === 'index') return true;
    const node = state.nodesById[props.nodeId];
    return node?.parentNodeId === VIRTUAL_ROOT_NODE_ID && isManualVirtualNodeFilter(node.virtualFilter) &&
      !state.nodeOrder.some(id => state.nodesById[id]?.parentNodeId === props.nodeId) &&
      !state.trashedNodeIds.some(id => state.nodesById[id]?.parentNodeId === props.nodeId);
  });
  if (!getDiveRepository() || !eligible) return null;
  return <NodeContextMenuItem icon={ArrowRightLeft} onSelect={() => {
    props.onClose();
    void convertWorkspaceDiveDirectory(props.nodeId, props.target, t('desktop.nodeList.dive.convertFailed'));
  }}>
    {t(props.target === 'dive' ? 'desktop.nodeList.dive.convertToDive' : 'desktop.nodeList.dive.convertToIndex')}
  </NodeContextMenuItem>;
}
