import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { NodeViewState } from '../../store/workspaceStore';
import type { SelectionCommandPayload } from '../contextCommands';
import type { ReadingPositionSyncState } from '../hooks/useAppRuntime';

export interface ImmersiveReadingModeSource {
  activeNodeId: string | null;
  beginApplyingReadingPosition: (selection: EditorSelection, reason: string) => void;
  completeApplyingReadingPosition: (reason: string, selection?: EditorSelection) => void;
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
  editorNodeViewState?: NodeViewState | undefined;
  getReadingPositionSelection: () => EditorSelection | null;
  getReadingPositionSyncState: () => ReadingPositionSyncState | null;
  isImmersiveMode: boolean;
  isStudyMode: boolean;
  nodesById: Record<string, Node>;
  onCreateSelectionNote: (payload: SelectionCommandPayload) => string | null;
  onExitImmersiveMode: () => void;
  onToggleImmersiveMode: () => void;
  onToggleSelectionHighlight: (payload: SelectionCommandPayload) => 'created' | 'deleted' | null;
  setReadingPositionSelection: (selection: EditorSelection) => void;
  trashedNodeIds: string[];
}
