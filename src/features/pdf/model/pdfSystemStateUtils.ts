import type { MutableRefObject } from 'react';

import type { NodeViewState } from '../../../store/workspaceStore';

import type { PdfJumpRequest } from './pdfSystemApi';

export const PDF_PAGE_MIN = 1;
export const PDF_ZOOM_DEFAULT = 100;
export const PDF_ZOOM_MAX = 200;
export const PDF_ZOOM_MIN = 50;
export const PDF_ZOOM_STEP = 10;

export function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export function resolveInitialPage(nodeViewState?: NodeViewState) {
  return clampInteger(nodeViewState?.selection.from ?? PDF_PAGE_MIN, PDF_PAGE_MIN, Number.MAX_SAFE_INTEGER);
}

export function resolveInitialZoom(nodeViewState?: NodeViewState) {
  return clampInteger(nodeViewState?.selection.to ?? PDF_ZOOM_DEFAULT, PDF_ZOOM_MIN, PDF_ZOOM_MAX);
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
