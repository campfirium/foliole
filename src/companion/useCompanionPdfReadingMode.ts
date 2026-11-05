import { useLayoutEffect, useState } from 'react';

import { getPdfReadingMode, resolvePdfReadingModeForColorMode, setPdfReadingMode } from '../features/settings/model/appearanceReadingModeSettings';
import type { PdfReadingMode } from '../features/settings/model/appearanceSettingsOptions';
import type { ResolvedBaseColorMode } from '../features/settings/model/baseColorMode';

export function useCompanionPdfReadingMode(colorMode: ResolvedBaseColorMode) {
  const [pdfReadingMode, setMode] = useState(getPdfReadingMode);
  const [pdfReadingModeSaveError, setSaveError] = useState(false);
  useLayoutEffect(() => {
    document.documentElement.dataset.pdfReadingMode = resolvePdfReadingModeForColorMode(pdfReadingMode, colorMode);
  }, [pdfReadingMode, colorMode]);
  const updatePdfReadingMode = (next: PdfReadingMode) => {
    try {
      setPdfReadingMode(next);
      setMode(next);
      setSaveError(false);
    } catch { setSaveError(true); }
  };
  return { pdfReadingMode, pdfReadingModeSaveError, updatePdfReadingMode };
}
