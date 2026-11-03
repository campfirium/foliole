declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' {
  export const WorkerMessageHandler: {
    setup(handler: unknown, port: unknown): void;
    initializeFromPort(port: unknown): void;
  };
}
