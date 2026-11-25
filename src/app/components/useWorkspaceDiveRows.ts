import { useEffect, useMemo, useState } from 'react';

import { DIVE_SECTION_ROW_ID, readDiveNode, type Dive } from '../../../lib/core/nodes/dive';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { HOME_NODE_ID } from '../../features/nodes/model/specialNodes';

export type DiveSourceSelection = { diveId: string; nodeId: string };

function useAllDivesSelection(activeNodeId: string | null, isOtherView: boolean) {
  const [selection, setSelection] = useState<{ origin: string | null; target?: string } | null>(null);
  const selected = !isOtherView && Boolean(selection && (
    selection.origin === activeNodeId || selection.target === activeNodeId
  ));
  useEffect(() => {
    if (!selection) return;
    if (!selected) setSelection(null);
    else if (selection.target === activeNodeId) setSelection({ origin: activeNodeId });
  }, [activeNodeId, selected, selection]);

  return {
    selected,
    select: (target?: string) => setSelection(target ? { origin: activeNodeId, target } : { origin: activeNodeId }),
    clear: () => setSelection(null)
  };
}

interface WorkspaceDiveNavigationProps {
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
}

export function useWorkspaceDiveNavigation(props: WorkspaceDiveNavigationProps, studyDiveId?: string) {
  const { nodeOrder, nodesById, trashedNodeIds } = props;
  const dives = useMemo(() => {
    const trashed = new Set(trashedNodeIds);
    return nodeOrder.flatMap(id => {
      const dive = trashed.has(id) ? null : readDiveNode(nodesById[id]);
      return dive ? [{ ...dive, directSourceIds: dive.directSourceIds.filter(sourceId => !trashed.has(sourceId)) }] : [];
    }).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }, [nodeOrder, nodesById, trashedNodeIds]);
  return useDiveNavigationSelection(props, dives, studyDiveId);
}

function useDiveNavigationSelection(
  props: WorkspaceDiveNavigationProps,
  dives: readonly Dive[],
  studyDiveId?: string
) {
  const [source, setSource] = useState<DiveSourceSelection | null>(null);
  const isOtherView = props.isVirtualViewOpen || props.isTrashViewOpen || props.isExternalViewOpen;
  const allDives = useAllDivesSelection(props.activeNodeId, isOtherView);
  const sourceIsCurrent = !source ||
    props.activeNodeId === source.nodeId || props.browseRootNodeId === source.nodeId;
  useEffect(() => {
    if (isOtherView || !sourceIsCurrent) setSource(null);
  }, [isOtherView, sourceIsCurrent]);
  const browseDiveId = props.browseRootNodeId ?? props.activeNodeId;
  const activeDive = isOtherView || allDives.selected ? undefined : dives.find(dive => dive.id === (studyDiveId ?? browseDiveId));
  const sourceDive = source && dives.find(dive => dive.id === source.diveId);
  const activeDiveSource = !isOtherView && studyDiveId === undefined && source && sourceIsCurrent &&
    sourceDive?.directSourceIds.includes(source.nodeId) ? source : null;
  return {
    activeDive,
    showAllDives: allDives.selected,
    closeDiveSelection: () => { setSource(null); allDives.clear(); },
    onSelectAllDivesTopic: (id: string) => {
      allDives.select(id);
      props.onSelectNode(id);
    },
    navigation: {
      dives,
      activeDiveId: allDives.selected ? DIVE_SECTION_ROW_ID : activeDive?.id ?? null,
      activeDiveSource,
      onSelectDiveSource: (diveId: string, nodeId: string) => {
        if (isOtherView) props.onOpenNotesView();
        allDives.clear();
        setSource({ diveId, nodeId });
        props.onSelectNode(nodeId);
      },
      onSelectDive: (id: string) => {
        setSource(null);
        if (id === DIVE_SECTION_ROW_ID) {
          allDives.select(isOtherView ? HOME_NODE_ID : undefined);
          if (isOtherView) props.onSelectNode(HOME_NODE_ID);
        } else {
          allDives.clear();
          props.onSelectNode(id);
        }
      }
    }
  };
}
