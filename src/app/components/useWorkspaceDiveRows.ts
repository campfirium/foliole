import { useEffect, useMemo, useState } from 'react';

import { readDiveNode } from '../../../lib/core/nodes/dive';
import type { Node } from '../../features/nodes/model/nodeTypes';

export function useWorkspaceDiveNavigation(props: {
  nodesById: Record<string, Node | undefined>;
  nodeOrder: readonly string[];
  trashedNodeIds: readonly string[];
  isVirtualViewOpen: boolean;
  isTrashViewOpen: boolean;
  isExternalViewOpen: boolean;
  onOpenNotesView: () => void;
}) {
  const { nodeOrder, nodesById, trashedNodeIds } = props;
  const dives = useMemo(() => {
    const trashed = new Set(trashedNodeIds);
    return nodeOrder.flatMap(id => {
      const dive = trashed.has(id) ? null : readDiveNode(nodesById[id]);
      return dive ? [{ ...dive, directSourceIds: dive.directSourceIds.filter(sourceId => !trashed.has(sourceId)) }] : [];
    }).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }, [nodeOrder, nodesById, trashedNodeIds]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isOtherView = props.isVirtualViewOpen || props.isTrashViewOpen || props.isExternalViewOpen;
  useEffect(() => {
    if (isOtherView) setSelectedId(null);
  }, [isOtherView]);
  const activeDive = isOtherView ? undefined : dives.find((dive) => dive.id === selectedId);
  return {
    activeDive,
    closeDive: () => setSelectedId(null),
    navigation: {
      dives,
      activeDiveId: activeDive?.id ?? null,
      onSelectDive: (id: string) => {
        if (isOtherView) props.onOpenNotesView();
        setSelectedId(id);
      }
    }
  };
}
