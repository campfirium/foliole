import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { SelectionCommandPayload } from '../contextCommands';

export interface ImmersiveKeydownSource {
  activeNodeId: string | null;
  beginApplyingReadingPosition: (selection: EditorSelection, reason: string) => void;
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
  isImmersiveMode: boolean;
  onCreateSelectionNote: (payload: SelectionCommandPayload) => string | null;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
  onToggleImmersiveMode: () => void;
  onToggleSelectionHighlight: (payload: SelectionCommandPayload) => 'created' | 'deleted' | null;
}
