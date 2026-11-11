import { useEffect, useMemo, useState } from 'react';

import { readDiveNode } from '../../../lib/core/nodes/dive';
import type { Node } from '../../features/nodes/model/nodeTypes';

export type DiveSourceSelection = { diveId: string; nodeId: string };

export function useWorkspaceDiveNavigation(props: {
  nodesById: Record<string, Node | undefined>;
  nodeOrder: readonly string[];
  trashedNodeIds: readonly string[];
  activeNodeId: string | null;
  browseRootNodeId?: string;
  onSelectNode: (nodeId: string) => void;
  isVirtualViewOpen: boolean;
  isTrashViewOpen: boolean;
  isExternalViewOpen: boolean;
  onOpenNotesView: () => void;
}, studyDiveId?: string) {
  const { nodeOrder, nodesById, trashedNodeIds } = props;
  const dives = useMemo(() => {
    const trashed = new Set(trashedNodeIds);
    return nodeOrder.flatMap(id => {
      const dive = trashed.has(id) ? null : readDiveNode(nodesById[id]);
      return dive ? [{ ...dive, directSourceIds: dive.directSourceIds.filter(sourceId => !trashed.has(sourceId)) }] : [];
    }).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }, [nodeOrder, nodesById, trashedNodeIds]);
  const [source, setSource] = useState<DiveSourceSelection | null>(null);
  const isOtherView = props.isVirtualViewOpen || props.isTrashViewOpen || props.isExternalViewOpen;
  const sourceIsCurrent = !source ||
    props.activeNodeId === source.nodeId || props.browseRootNodeId === source.nodeId;
  useEffect(() => {
    if (isOtherView || !sourceIsCurrent) setSource(null);
  }, [isOtherView, sourceIsCurrent]);
  const browseDiveId = props.browseRootNodeId ?? props.activeNodeId;
  const activeDive = isOtherView ? undefined : dives.find(dive => dive.id === (studyDiveId ?? browseDiveId));
  const sourceDive = source && dives.find(dive => dive.id === source.diveId);
  const activeDiveSource = !isOtherView && studyDiveId === undefined && source && sourceIsCurrent &&
    sourceDive?.directSourceIds.includes(source.nodeId) ? source : null;
  return {
    activeDive,
    closeDiveSource: () => setSource(null),
    navigation: {
      dives,
      activeDiveId: activeDive?.id ?? null,
      activeDiveSource,
      onSelectDiveSource: (diveId: string, nodeId: string) => {
        if (isOtherView) props.onOpenNotesView();
        setSource({ diveId, nodeId });
        props.onSelectNode(nodeId);
      },
      onSelectDive: (id: string) => {
        setSource(null);
        props.onSelectNode(id);
      }
    }
  };
}
