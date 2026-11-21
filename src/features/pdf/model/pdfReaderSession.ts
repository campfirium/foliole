/** Counts for one open PDF original; no title, page text or file location is kept. */
export type PdfReaderSessionReport = {
  startedAt: number; endedAt: number; firstPageMs: number | null; sourceResolutions: number; documentLoads: number;
  textLayerRenders: number; textLayerRebuilds: number;
};
type PdfReaderSessionSink = (report: PdfReaderSessionReport) => void;
type Session = Omit<PdfReaderSessionReport, 'endedAt'>;

let sink: PdfReaderSessionSink | undefined;
let active: Session | undefined;

/** The phone installs the sink; without one the reader only bumps counters nobody reads. */
export function providePdfReaderSessionSink(next: PdfReaderSessionSink | undefined) {
  sink = next;
}

/** One reader shows one original at a time, so later notes belong to the session that began last. */
export function beginPdfReaderSession() {
  const session: Session = { startedAt: performance.now(), firstPageMs: null, sourceResolutions: 0, documentLoads: 0,
    textLayerRenders: 0, textLayerRebuilds: 0 };
  active = session;
  return () => {
    if (active === session) active = undefined;
    sink?.({ ...session, endedAt: performance.now() });
  };
}

export function notePdfReaderSourceResolved() {
  if (active) active.sourceResolutions += 1;
}

export function notePdfReaderDocumentLoaded() {
  if (active) active.documentLoads += 1;
}

/** `rebuilt` means the same mounted page drew its text layer again at an unchanged width. */
export function notePdfReaderTextLayer(rebuilt: boolean) {
  if (!active) return;
  active.textLayerRenders += 1;
  if (rebuilt) active.textLayerRebuilds += 1;
  active.firstPageMs ??= Math.max(0, Math.round(performance.now() - active.startedAt));
}
