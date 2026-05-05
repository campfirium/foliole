import {
  CompanionSelectionAnnotationToolbar,
  type CompanionSelectionAnnotationKind,
  type CompanionSelectionAnnotationToolbarState
} from './CompanionSelectionAnnotationToolbar';

import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

export function SelectionAnnotationToolbarLayer(props: {
  onAddExistingHighlightNote?: (nodeId: string, originalText: string, note: string) => Promise<string | null> | string | null;
  onClose(): void;
  onCreateSelectionAnnotation?: (
    kind: CompanionSelectionAnnotationKind,
    payload: SelectionCommandPayload,
    note?: string
  ) => Promise<string | null> | string | null;
  onDeleteExistingHighlight?: (nodeId: string) => Promise<string | null> | string | null;
  resolveSelectionPayload: () => SelectionCommandPayload | null;
  state: CompanionSelectionAnnotationToolbarState | null;
}) {
  return (
    <CompanionSelectionAnnotationToolbar
      onAddExistingHighlightNote={async (nodeId, originalText, note) => {
        await props.onAddExistingHighlightNote?.(nodeId, originalText, note);
      }}
      onApply={async (kind, payload, note) => {
        await props.onCreateSelectionAnnotation?.(kind, payload, note);
      }}
      onClose={props.onClose}
      onDeleteExistingHighlight={async (nodeId) => {
        await props.onDeleteExistingHighlight?.(nodeId);
      }}
      resolveSelectionPayload={props.resolveSelectionPayload}
      state={props.state}
    />
  );
}
