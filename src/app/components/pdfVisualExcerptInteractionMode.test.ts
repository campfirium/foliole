import { describe, expect, it } from 'vitest';

import {
  canStartPdfVisualExcerpt,
  isPdfVisualExcerptModifierPressed,
  resolvePdfVisualExcerptModifier
} from './pdfVisualExcerptInteractionMode';

describe('PDF region excerpt interaction mode', () => {
  it('projects Option on macOS and Alt on Windows and Linux', () => {
    expect(resolvePdfVisualExcerptModifier('MacIntel')).toBe('⌥');
    expect(resolvePdfVisualExcerptModifier('Win32')).toBe('Alt');
    expect(resolvePdfVisualExcerptModifier('Linux x86_64')).toBe('Alt');
  });

  it('uses the browser Alt flag for both Option and Alt pointer contracts', () => {
    expect(isPdfVisualExcerptModifierPressed({ altKey: true })).toBe(true);
    expect(isPdfVisualExcerptModifierPressed({ altKey: false })).toBe(false);
  });

  it('allows explicit selection and quick mode without changing ordinary eligibility', () => {
    expect(canStartPdfVisualExcerpt({ explicitSelection: false, mode: 'ordinary', modifierPressed: false })).toBe(false);
    expect(canStartPdfVisualExcerpt({ explicitSelection: false, mode: 'ordinary', modifierPressed: true })).toBe(true);
    expect(canStartPdfVisualExcerpt({ explicitSelection: false, mode: 'quick', modifierPressed: false })).toBe(true);
    expect(canStartPdfVisualExcerpt({ explicitSelection: true, mode: 'ordinary', modifierPressed: false })).toBe(true);
  });
});
