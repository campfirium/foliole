import { pdfjs } from 'react-pdf';

import { configurePdfWorker as configureRuntimePdfWorker } from '../../../shared/platform/runtime/pdfWorker';

export function configurePdfWorker() {
  configureRuntimePdfWorker(pdfjs);
}
