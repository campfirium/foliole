// This dependency must initialize before PDF.js evaluates in the worker realm.
import './pdfWorkerCompatibility';

export { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
