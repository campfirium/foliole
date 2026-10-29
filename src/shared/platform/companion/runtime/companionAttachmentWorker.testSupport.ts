import { Worker as NodeWorker } from 'node:worker_threads';

import { build } from 'vite';
import { vi } from 'vitest';

async function buildParser() {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'lib/core/attachments/attachmentReferenceParser.worker.ts', formats: ['iife'], name: 'AttachmentParser' } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || !('output' in output) || output.output[0]?.type !== 'chunk') throw new Error('Missing parser worker bundle');
  return output.output[0].code;
}

let parserBundle: Promise<string> | undefined;

/** Executes the production parser entry on a real thread; companion bundling is separately tested in Chromium. */
export async function installCompanionAttachmentTestWorker() {
  const bundle = await (parserBundle ??= buildParser());
  const monitor = { parsed: 0, batches: 0, beforeResult: undefined as undefined | (() => Promise<void> | void) };
  const workers: NodeWorker[] = [];
  class BrowserWorker {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: (event: { message: string }) => void;
    private readonly worker: NodeWorker;
    constructor() {
      const script = `const { parentPort } = require('node:worker_threads');
        globalThis.self = { postMessage: data => parentPort.postMessage(data) };
        ${bundle}
        parentPort.on('message', data => self.onmessage({ data }));`;
      this.worker = new NodeWorker(script, { eval: true });
      workers.push(this.worker);
      this.worker.on('message', data => {
        void Promise.resolve(monitor.beforeResult?.()).then(() => this.onmessage?.({ data }),
          error => this.onerror?.({ message: String(error) }));
      });
      this.worker.on('error', error => this.onerror?.({ message: error instanceof Error ? error.message : String(error) }));
    }
    postMessage(rows: unknown[]) { monitor.parsed += rows.length; monitor.batches++; this.worker.postMessage(rows); }
    terminate() { void this.worker.terminate(); }
  }
  vi.stubGlobal('Worker', BrowserWorker);
  return { monitor, async close() { await Promise.all(workers.map(worker => worker.terminate())); vi.unstubAllGlobals(); } };
}
