import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { readCompanionHighlight } from '../shared/platform/companion/reading/companionHighlightRead';
import type { CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';

import type { CompanionExistingHighlightTarget } from './companionExistingHighlightActions';
import { resolveCompanionAdjustableHighlight } from './CompanionHighlightRangeHandles';
import type { CompanionHighlightRangeHandler } from './companionHighlightRangePersistence';
import {
  CompanionSelectionAnnotationToolbar,
  type CompanionSelectionAnnotationKind,
  type CompanionSelectionAnnotationToolbarState
} from './CompanionSelectionAnnotationToolbar';

import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

export function SelectionAnnotationToolbarLayer(props: {
  editor?: EditorAdapter | null;
  parentNodeId?: string;
  onAdjustExistingHighlightRange?: CompanionHighlightRangeHandler;
  onActivateExistingHighlight?: (target: CompanionExistingHighlightTarget) => void;
  onAddExistingHighlightNote?: (nodeId: string, originalText: string, note: string, guard?: CompanionHighlightReadGuard) => Promise<string | null> | string | null;
  onClose(): void;
  onOpenExistingHighlight?: ((nodeId: string) => void) | undefined;
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
  const adjustable = resolveCompanionAdjustableHighlight({ editor: props.editor ?? null,
    nodeId: props.state?.existingHighlight?.nodeId, parentNodeId: props.parentNodeId, snapshot: props.snapshot });
  const state = props.state?.existingHighlight && adjustable ? { ...props.state,
    existingHighlight: { ...props.state.existingHighlight, originalText: adjustable.locator.originalText } } : props.state;
  return (
    <CompanionSelectionAnnotationToolbar
      editor={props.editor} parentNodeId={props.parentNodeId} snapshot={props.snapshot}
      onAdjustExistingHighlightRange={props.onAdjustExistingHighlightRange}
      onAddExistingHighlightNote={async (nodeId, originalText, note, guard) => {
        const result = await props.onAddExistingHighlightNote?.(nodeId, originalText, note, guard);
        if (!result) throw new Error('companion_highlight_node_unavailable');
      }}
      onApply={async (kind, payload, note) => {
        const nodeId = await props.onCreateSelectionAnnotation?.(kind, payload, note);
        if (nodeId && props.onActivateExistingHighlight) {
          props.onActivateExistingHighlight({ nodeId, kind: kind === 'cloze' ? 'cloze' : 'highlight', originalText: payload.selectionText });
          return true;
        }
      }}
      onClose={props.onClose}
      onOpenExistingHighlight={props.onOpenExistingHighlight}
      onDeleteExistingHighlight={async (nodeId, guard) => {
        const result = await props.onDeleteExistingHighlight?.(nodeId, guard);
        if (!result) throw new Error('companion_highlight_node_unavailable');
      }}
      resolveSelectionPayload={props.resolveSelectionPayload}
      loadExistingHighlight={(nodeId) => readCompanionHighlight(props.snapshot, nodeId, props.state?.existingHighlight?.kind)}
      state={state}
    />
  );
}
