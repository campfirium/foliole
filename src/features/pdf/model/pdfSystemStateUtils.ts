import type { MutableRefObject } from 'react';

import type { NodeViewState } from '../../../store/workspaceStore';

import type { PdfJumpRequest } from './pdfSystemApi';

export const PDF_PAGE_MIN = 1;
export const PDF_ZOOM_DEFAULT = 100;
export const PDF_ZOOM_MAX = 200;
export const PDF_ZOOM_MIN = 50;
export const PDF_ZOOM_STEP = 10;
export const PDF_ZOOM_MODE_FIT_WIDTH = 'fit-width';
export const PDF_ZOOM_MODE_CUSTOM = 'custom';
export const PDF_ZOOM_FIT_WIDTH_SENTINEL = 0;
const PDF_POSITION_PRECISION = 1000;

export type PdfZoomMode = 'custom' | 'fit-width';

export function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export function resolveInitialPage(nodeViewState?: NodeViewState) {
  return clampInteger(nodeViewState?.selection.from ?? PDF_PAGE_MIN, PDF_PAGE_MIN, Number.MAX_SAFE_INTEGER);
}

function clampPositionY(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function resolveInitialPositionY(nodeViewState?: NodeViewState) {
  if (!nodeViewState) {
    return 0;
  }
  return clampPositionY((Math.max(0, nodeViewState.scrollTop) % (PDF_POSITION_PRECISION + 1)) / PDF_POSITION_PRECISION);
}

export function resolveInitialZoomMode(nodeViewState?: NodeViewState): PdfZoomMode {
  const encodedZoom = nodeViewState?.selection.to;
  if (typeof encodedZoom === 'number' && encodedZoom >= PDF_ZOOM_MIN) {
    return PDF_ZOOM_MODE_CUSTOM;
  }
  return PDF_ZOOM_MODE_FIT_WIDTH;
}

export function resolveInitialCustomZoom(nodeViewState?: NodeViewState) {
  const encodedZoom = nodeViewState?.selection.to;
  if (typeof encodedZoom === 'number' && encodedZoom >= PDF_ZOOM_MIN) {
    return clampInteger(encodedZoom, PDF_ZOOM_MIN, PDF_ZOOM_MAX);
  }
  return PDF_ZOOM_DEFAULT;
}

export function createPersistedPdfViewState(args: {
  customZoom: number;
  page: number;
  positionY: number;
  zoomMode: PdfZoomMode;
}): NodeViewState {
  return {
    scrollTop: clampInteger(Math.round(clampPositionY(args.positionY) * PDF_POSITION_PRECISION), 0, PDF_POSITION_PRECISION),
    selection: {
      from: clampInteger(args.page, PDF_PAGE_MIN, Number.MAX_SAFE_INTEGER),
      to:
        args.zoomMode === PDF_ZOOM_MODE_CUSTOM
          ? clampInteger(args.customZoom, PDF_ZOOM_MIN, PDF_ZOOM_MAX)
          : PDF_ZOOM_FIT_WIDTH_SENTINEL
    }
  };
}

export function resolvePdfSource(sourceHint: string) {
  const trimmedSourceHint = sourceHint.trim();
  if (!trimmedSourceHint) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmedSourceHint) || /^file:\/\//i.test(trimmedSourceHint)) {
    return encodeURI(trimmedSourceHint);
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmedSourceHint)) {
    const normalizedPath = trimmedSourceHint.replace(/\\/g, '/');
    return `file:///${encodeURI(normalizedPath)}`;
  }

  if (trimmedSourceHint.startsWith('/')) {
    return `file://${encodeURI(trimmedSourceHint)}`;
  }

  return encodeURI(trimmedSourceHint);
}

export function createJumpRequest(nextIdRef: MutableRefObject<number>, page: number, positionY?: number): PdfJumpRequest {
  const request = { id: nextIdRef.current, page, positionY };
  nextIdRef.current += 1;
  return request;
}
