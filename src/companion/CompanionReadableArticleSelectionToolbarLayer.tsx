import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { readCompanionHighlight } from '../shared/platform/companion/reading/companionHighlightRead';
import type { CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';

import {
  CompanionSelectionAnnotationToolbar,
  type CompanionSelectionAnnotationKind,
  type CompanionSelectionAnnotationToolbarState
} from './CompanionSelectionAnnotationToolbar';

import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

export function SelectionAnnotationToolbarLayer(props: {
  onAddExistingHighlightNote?: (nodeId: string, originalText: string, note: string, guard?: CompanionHighlightReadGuard) => Promise<string | null> | string | null;
  onClose(): void;
  onCreateSelectionAnnotation?: (
    kind: CompanionSelectionAnnotationKind,
    payload: SelectionCommandPayload,
    note?: string
  ) => Promise<string | null> | string | null;
  onDeleteExistingHighlight?: (nodeId: string, guard?: CompanionHighlightReadGuard) => Promise<string | null> | string | null;
  resolveSelectionPayload: () => SelectionCommandPayload | null;
  state: CompanionSelectionAnnotationToolbarState | null;
  snapshot: WorkspaceSnapshot | null;
}) {
  return (
    <CompanionSelectionAnnotationToolbar
      onAddExistingHighlightNote={async (nodeId, originalText, note, guard) => {
        const result = await props.onAddExistingHighlightNote?.(nodeId, originalText, note, guard);
        if (!result) throw new Error('companion_highlight_node_unavailable');
      }}
      onApply={async (kind, payload, note) => {
        await props.onCreateSelectionAnnotation?.(kind, payload, note);
      }}
      onClose={props.onClose}
      onDeleteExistingHighlight={async (nodeId, guard) => {
        const result = await props.onDeleteExistingHighlight?.(nodeId, guard);
        if (!result) throw new Error('companion_highlight_node_unavailable');
      }}
      resolveSelectionPayload={props.resolveSelectionPayload}
      loadExistingHighlight={(nodeId) => readCompanionHighlight(props.snapshot, nodeId)}
      state={props.state}
    />
  );
}
