import { useContext, useEffect, useLayoutEffect, useState } from 'react';

import { PDF_ZOOM_STEP } from '../../features/pdf/model/pdfSystemStateUtils';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { loadRuntimeAppSettingsState, saveRuntimeAppSettingsState } from '../../shared/platform/appSettingsState';

import { PDF_VIEWPORT_INLINE_PADDING } from './PdfDocumentViewportSizing';
import { PdfExpandedWidthContext } from './pdfExpandedWidthContext';
import { type PdfPageDimensions, resolveRenderedPageDimensions } from './pdfPageDimensions';

export interface PdfExpandedWidthToggle {
  pressed: boolean;
  toggle: () => void;
  disabled: boolean;
  saveFailed: boolean;
}

export function usePdfExpandedWidth(args: {
  dimensions: PdfPageDimensions | undefined;
  fitWidth: number | null;
  onSetZoom: (zoom: number) => void;
  ready: boolean;
  rotation: number;
  zoom: number;
  zoomMode: 'custom' | 'fit-width';
}) {
  const reportWidth = useContext(PdfExpandedWidthContext);
  const { expanded, save, busy, saveFailed } = usePdfExpandedWidthPreference(reportWidth !== null);
  const baseWidth = args.dimensions
    ? resolveRenderedPageDimensions(args.dimensions, null, args.rotation, 'custom', 100).width
    : null;
  const fittedZoom = args.fitWidth && baseWidth ? (args.fitWidth / baseWidth) * 100 : null;
  const width = expanded && args.ready && args.zoomMode === 'custom' && args.dimensions
    ? resolveRenderedPageDimensions(args.dimensions, null, args.rotation, 'custom', args.zoom).width + PDF_VIEWPORT_INLINE_PADDING
    : 0;

  useLayoutEffect(() => () => reportWidth?.(0), [reportWidth]);
  useLayoutEffect(() => {
    reportWidth?.(width);
  }, [reportWidth, width]);

  const toggle: PdfExpandedWidthToggle | undefined = reportWidth ? {
    pressed: expanded === true,
    disabled: expanded === null || busy,
    saveFailed,
    toggle: () => {
      if (expanded === null || busy) return;
      void save(!expanded, () => {
        if (!expanded && args.zoomMode === 'fit-width' && fittedZoom !== null) {
          args.onSetZoom(Math.floor(fittedZoom));
        }
      });
    }
  } : undefined;
  return {
    toggle,
    fittedZoom,
    fitWidthZoom: expanded && fittedZoom !== null ? Math.floor(fittedZoom) : null
  };
}

function usePdfExpandedWidthPreference(available: boolean) {
  const key = APP_SETTINGS_STORAGE_KEYS.pdfAutoExpandWidth;
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    if (!available) return;
    let active = true;
    void loadRuntimeAppSettingsState().then(settings => {
      if (active) setExpanded(settings?.[key] === 'true');
    });
    return () => { active = false; };
  }, [available, key]);
  const save = async (enabled: boolean, onSaved: () => void) => {
    setBusy(true);
    const saved = await saveRuntimeAppSettingsState({ [key]: String(enabled) });
    setBusy(false);
    setSaveFailed(!saved);
    if (!saved) return;
    onSaved();
    setExpanded(enabled);
  };
  return { expanded, save, busy, saveFailed };
}

export function stepPdfFitWidthZoom(zoom: number, direction: 1 | -1) {
  return Math.round(zoom) + direction * PDF_ZOOM_STEP;
}
