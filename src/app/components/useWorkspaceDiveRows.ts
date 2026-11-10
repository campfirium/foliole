import { useEffect, useMemo, useState } from 'react';

import { readDiveNode } from '../../../lib/core/nodes/dive';
import type { Node } from '../../features/nodes/model/nodeTypes';

export type DiveSourceSelection = { diveId: string; nodeId: string };

type DiveSelection =
  | { kind: 'dive'; diveId: string }
  | ({ kind: 'source' } & DiveSourceSelection);

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
  const [selection, setSelection] = useState<DiveSelection | null>(null);
  const isOtherView = props.isVirtualViewOpen || props.isTrashViewOpen || props.isExternalViewOpen;
  const sourceIsCurrent = selection?.kind !== 'source' ||
    props.activeNodeId === selection.nodeId || props.browseRootNodeId === selection.nodeId;
  useEffect(() => {
    if (isOtherView || !sourceIsCurrent) setSelection(null);
  }, [isOtherView, sourceIsCurrent]);
  const selectedDive = isOtherView ? undefined : dives.find((dive) => dive.id === selection?.diveId);
  const activeDive = studyDiveId === undefined
    ? selection?.kind === 'dive' ? selectedDive : undefined
    : !isOtherView ? dives.find(dive => dive.id === studyDiveId) : undefined;
  const activeDiveSource = studyDiveId === undefined && selection?.kind === 'source' && sourceIsCurrent &&
    selectedDive?.directSourceIds.includes(selection.nodeId) ? selection : null;
  return {
    activeDive,
    closeDive: () => setSelection(null),
    navigation: {
      dives,
      activeDiveId: activeDive?.id ?? null,
      activeDiveSource,
      onSelectDiveSource: (diveId: string, nodeId: string) => {
        if (isOtherView) props.onOpenNotesView();
        setSelection({ kind: 'source', diveId, nodeId });
        props.onSelectNode(nodeId);
      },
      onSelectDive: (id: string) => {
        if (isOtherView) props.onOpenNotesView();
        setSelection({ kind: 'dive', diveId: id });
      }
    }
  };
}
