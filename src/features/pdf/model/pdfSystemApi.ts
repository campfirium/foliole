import type { NodeViewState } from '../../../store/workspaceStore';

export interface PdfJumpRequest {
  id: number;
  page: number;
}

export interface PdfSystemState {
  loadError: string | null;
  maxPage: number;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pdfSource: string;
  rotation: number;
  totalPages: number | null;
  zoom: number;
}

export interface PdfSystemExternalApi {
  clearPageJumpRequest: (requestId: number) => void;
  openSource: (sourceHint: string, nodeViewState?: NodeViewState) => void;
  reportLoadError: (message: string | null) => void;
  reportLoadSuccess: (numPages: number) => void;
  requestPageChange: (value: number) => void;
  rotateClockwise: () => void;
  setVisiblePage: (page: number) => void;
  stepPage: (direction: -1 | 1) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export interface PdfSystemController {
  actions: PdfSystemExternalApi;
  state: PdfSystemState;
}
