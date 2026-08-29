import { usesMacShortcutProjection } from '../../shared/platform/runtime/operatingSystem';

export type PdfVisualExcerptInteractionMode = 'ordinary' | 'quick';

export function resolvePdfVisualExcerptModifier(platformText?: string) {
  return usesMacShortcutProjection(platformText) ? '⌥' : 'Alt';
}

export function isPdfVisualExcerptModifierPressed(event: Pick<KeyboardEvent | PointerEvent, 'altKey'>) {
  return event.altKey;
}

export function canStartPdfVisualExcerpt(args: {
  explicitSelection: boolean;
  mode: PdfVisualExcerptInteractionMode;
  modifierPressed: boolean;
}) {
  return args.explicitSelection || args.mode === 'quick' || args.modifierPressed;
}
