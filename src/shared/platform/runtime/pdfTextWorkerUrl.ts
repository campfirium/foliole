export function configurePdfTextWorker(pdfjs: { version: string; GlobalWorkerOptions: { workerSrc: string } }) {
  const workerUrl = new URL('./pdfjs-resources/pdf-text-worker.mjs', document.baseURI);
  workerUrl.searchParams.set('v', pdfjs.version);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.toString();
}
