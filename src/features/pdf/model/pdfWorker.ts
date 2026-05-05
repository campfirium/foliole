import { pdfjs } from 'react-pdf';

export function configurePdfWorker() {
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

  if ('pdfjsWorker' in globalThis) {
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'pdfjsWorker');
  }

  pdfjs.GlobalWorkerOptions.workerSrc = `${workerUrl}?v=${encodeURIComponent(pdfjs.version)}`;
}
