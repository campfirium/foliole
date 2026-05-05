import { useMemo, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { isPdfAnchorLocator, type NodeAnchorLink } from '../../nodes/model/nodeTypes';

import type { PdfJumpRequest } from './pdfSystemApi';
import { clampInteger, createJumpRequest, PDF_PAGE_MIN, PDF_ZOOM_MAX, PDF_ZOOM_MIN, PDF_ZOOM_MODE_CUSTOM, PDF_ZOOM_MODE_FIT_WIDTH, PDF_ZOOM_STEP } from './pdfSystemStateUtils';

interface PdfSystemActionArgs {
  maxPage: number;
  page: number;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>;
  setPositionY: Dispatch<SetStateAction<number>>;
  setPdfSource: Dispatch<SetStateAction<string>>;
  setRotation: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number | null>>;
  setZoom: Dispatch<SetStateAction<number>>;
  setZoomMode: Dispatch<SetStateAction<'custom' | 'fit-width'>>;
}

interface CreatePdfSystemActionArgs extends PdfSystemActionArgs {
  jumpRequestIdRef: MutableRefObject<number>;
}

export function usePdfSystemActions(args: PdfSystemActionArgs) {
  const jumpRequestIdRef = useRef(1);

  return useMemo(
    () =>
      createPdfSystemActions({
        ...args,
        jumpRequestIdRef
      }),
    [args]
  );
}

function createPdfSystemActions(args: CreatePdfSystemActionArgs) {
  const queuePageJump = (jumpPage: number, positionY?: number) => {
    args.setPageJumpRequest(createJumpRequest(args.jumpRequestIdRef, jumpPage, positionY));
  };

  return {
    ...createPdfCoreActions(args),
    requestAnchorJump: (locator: NonNullable<NodeAnchorLink['locator']>) => {
      if (!isPdfAnchorLocator(locator)) {
        return;
      }
      const nextPage = clampInteger(locator.page, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      args.setPositionY(Math.max(0, Math.min(1, locator.y ?? 0)));
      queuePageJump(nextPage, locator.y);
    },
    requestPageChange: (value: number) => {
      const nextPage = clampInteger(value, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      args.setPositionY(0);
      queuePageJump(nextPage);
    },
    setVisibleLocation: (visiblePage: number, positionY: number) => {
      const nextPage = clampInteger(visiblePage, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      args.setPositionY(Math.max(0, Math.min(1, positionY)));
    },
    stepPage: (direction: -1 | 1) => {
      const nextPage = clampInteger(args.page + direction, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      args.setPositionY(0);
      queuePageJump(nextPage);
    }
  };
}

function createPdfCoreActions(args: CreatePdfSystemActionArgs) {
  return {
    clearPageJumpRequest: (requestId: number) => {
      args.setPageJumpRequest((current) => (current?.id === requestId ? null : current));
    },
    reportLoadError: (message: string | null) => {
      args.setLoadError(message);
    },
    reportLoadSuccess: (numPages: number) => {
      args.setLoadError(null);
      args.setTotalPages(numPages);
    },
    rotateClockwise: () => {
      args.setRotation((current) => (current + 90) % 360);
    },
    setFitWidth: () => {
      args.setZoomMode(PDF_ZOOM_MODE_FIT_WIDTH);
    },
    setZoom: (value: number) => {
      args.setZoomMode(PDF_ZOOM_MODE_CUSTOM);
      args.setZoom(clampInteger(value, PDF_ZOOM_MIN, PDF_ZOOM_MAX));
    },
    zoomIn: () => {
      args.setZoomMode(PDF_ZOOM_MODE_CUSTOM);
      args.setZoom((current) => Math.min(PDF_ZOOM_MAX, current + PDF_ZOOM_STEP));
    },
    zoomOut: () => {
      args.setZoomMode(PDF_ZOOM_MODE_CUSTOM);
      args.setZoom((current) => Math.max(PDF_ZOOM_MIN, current - PDF_ZOOM_STEP));
    }
  };
}
