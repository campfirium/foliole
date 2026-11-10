import { ArrowRightLeft } from 'lucide-react';
import { useContext } from 'react';

import { isManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import { NodeContextMenuItem } from '../../features/nodes/components/nodeListContextMenuPresentation';
import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { getDiveRepository } from '../../shared/platform/desktop/diveRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { VirtualNodeConversionResults } from './useVirtualNodeResultIndex';
import { convertWorkspaceDiveDirectory } from './workspaceDiveMutation';

export function ConvertDiveDirectoryMenuItem(props: { nodeId: string; target: 'dive' | 'index'; onClose: () => void }) {
  const t = useTranslation();
  const results = useContext(VirtualNodeConversionResults);
  const filter = results?.nodesById[props.nodeId]?.virtualFilter;
  const ids = results?.resultIdsByVirtualId.get(props.nodeId);
  const matched = props.target === 'dive' && filter && !isManualVirtualNodeFilter(filter) && ids
    ? { filter: JSON.stringify(filter), ids } : undefined;
  const eligible = useWorkspaceStore(state => {
    if (props.target === 'index') return true;
    const node = state.nodesById[props.nodeId];
    return node?.parentNodeId === VIRTUAL_ROOT_NODE_ID && (isManualVirtualNodeFilter(node.virtualFilter) || Boolean(matched)) &&
      !state.nodeOrder.some(id => state.nodesById[id]?.parentNodeId === props.nodeId) &&
      !state.trashedNodeIds.some(id => state.nodesById[id]?.parentNodeId === props.nodeId);
  });
  if (!getDiveRepository() || !eligible) return null;
  return <NodeContextMenuItem icon={ArrowRightLeft} onSelect={() => {
    props.onClose();
    void convertWorkspaceDiveDirectory(props.nodeId, props.target, t('desktop.nodeList.dive.convertFailed'), matched);
  }}>
    {t(props.target === 'dive' ? 'desktop.nodeList.dive.convertToDive' : 'desktop.nodeList.dive.convertToIndex')}
  </NodeContextMenuItem>;
}
