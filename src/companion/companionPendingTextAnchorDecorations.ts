import type { CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';

import type { EditorTextAnchorDecoration } from '@/features/editor/adapters/EditorAdapter';
import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

function hasSameAnchorRange(a: EditorTextAnchorDecoration, b: EditorTextAnchorDecoration) {
  return a.from === b.from && a.to === b.to && a.kind === b.kind;
}

export function createCompanionPendingTextAnchorDecorations(
  kind: CompanionSelectionAnnotationKind,
  payload: SelectionCommandPayload
): EditorTextAnchorDecoration[] {
  const anchorKind: EditorTextAnchorDecoration['kind'] = kind === 'cloze' ? 'cloze' : 'highlight';
  return payload.entries
    .map((entry, index) => ({
      from: Math.min(entry.range.from, entry.range.to),
      kind: anchorKind,
      nodeId: 'pending-' + payload.anchorId + '-' + index,
      to: Math.max(entry.range.from, entry.range.to)
    }))
    .filter((decoration) => decoration.from < decoration.to);
}

export function mergeCompanionPendingTextAnchorDecorations(args: {
  pending: readonly EditorTextAnchorDecoration[];
  real: readonly EditorTextAnchorDecoration[];
}) {
  return [
    ...args.real,
    ...args.pending.filter((pending) => !args.real.some((real) => hasSameAnchorRange(real, pending)))
  ];
}

export function removeResolvedCompanionPendingTextAnchorDecorations(args: {
  pending: readonly EditorTextAnchorDecoration[];
  real: readonly EditorTextAnchorDecoration[];
}) {
  return args.pending.filter((pending) => !args.real.some((real) => hasSameAnchorRange(real, pending)));
}
