import type { AttachmentReferenceInput, AttachmentReferenceResult } from '../../../../../lib/core/attachments/attachmentReferenceInputs';

/** One worker per observation, reused for all bounded batches; no UI-thread parsing fallback. */
export function createCompanionAttachmentParser(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const worker = new Worker(new URL('../../../../../lib/core/attachments/attachmentReferenceParser.worker.ts', import.meta.url), { type: 'module' });
  let pending: { resolve: (rows: AttachmentReferenceResult[]) => void; reject: (error: unknown) => void } | undefined;
  let closed = false;
  const close = (error: unknown = new Error('attachment_scan_parser_closed')) => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', abort);
    worker.terminate();
    pending?.reject(error);
    pending = undefined;
  };
  const abort = () => close(signal?.reason ?? new Error('attachment_scan_cancelled'));
  worker.onmessage = ({ data }: MessageEvent<{ results?: AttachmentReferenceResult[]; error?: string }>) => {
    if (!pending || closed) return;
    const request = pending;
    pending = undefined;
    if (data.error || !Array.isArray(data.results)) request.reject(new Error(data.error ?? 'attachment_scan_result_missing'));
    else request.resolve(data.results);
  };
  worker.onerror = event => close(new Error(event.message));
  signal?.addEventListener('abort', abort, { once: true });
  return {
    parse(rows: AttachmentReferenceInput[]): Promise<AttachmentReferenceResult[]> {
      if (closed) return Promise.reject(new Error('attachment_scan_parser_closed'));
      if (pending) return Promise.reject(new Error('attachment_scan_parser_busy'));
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try { worker.postMessage(rows); }
        catch (error) { close(error); }
      });
    },
    close
  };
}
