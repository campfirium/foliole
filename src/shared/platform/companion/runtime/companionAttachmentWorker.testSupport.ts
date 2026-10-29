import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';

import { vi } from 'vitest';

/** Executes the production parser entry on a real thread; companion bundling is separately tested in Chromium. */
export function installCompanionAttachmentTestWorker() {
  const monitor = { parsed: 0, batches: 0, beforeResult: undefined as undefined | (() => Promise<void> | void) };
  const workers: NodeWorker[] = [];
  class BrowserWorker {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: (event: { message: string }) => void;
    private readonly worker: NodeWorker;
    constructor() {
      const asset = path.resolve('dist/lib/core/attachments/attachmentReferenceParser.worker.js');
      if (!fs.existsSync(asset)) throw new Error('Run npm run electron:compile before companion worker tests');
      const script = `const { parentPort } = require('node:worker_threads');
        globalThis.self = { postMessage: data => parentPort.postMessage(data) };
        import(${JSON.stringify(pathToFileURL(asset).href)}).then(() =>
          parentPort.on('message', data => self.onmessage({ data })));`;
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
