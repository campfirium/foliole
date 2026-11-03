import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const root = path.resolve('dist/companion');
  server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>PDF worker</title>'); return; }
      const file = pathname === '/core.mjs' ? path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs')
        : pathname === '/fixture.pdf' ? path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf')
          : path.resolve(root, '.' + pathname);
      if (!['/core.mjs', '/fixture.pdf'].includes(pathname) && !file.startsWith(root + path.sep)) {
        response.writeHead(403).end(); return;
      }
      response.setHeader('Content-Type', file.endsWith('.pdf') ? 'application/pdf' : 'text/javascript');
      response.end(await readFile(file));
    })().catch(error => { response.writeHead(500).end(String(error)); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No PDF test server address.');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

test('the production PDF worker reads real text on its own thread and exports the same-URL handler', async ({ page }) => {
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const workers: { events: string[] }[] = [];
    const BaseWorker = Worker;
    globalThis.Worker = class extends BaseWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        const record = { events: [] as string[] };
        workers.push(record);
        this.addEventListener('message', event => record.events.push(event.data?.action ?? 'reply'));
      }
    };
    const coreUrl = new URL('/core.mjs', location.href).toString();
    const pdf = await import(/* @vite-ignore */ coreUrl);
    const workerUrl = new URL('/pdfjs-resources/pdf-text-worker.mjs', location.href).toString();
    pdf.GlobalWorkerOptions.workerSrc = workerUrl;
    const bytes = new Uint8Array(await (await fetch('/fixture.pdf')).arrayBuffer());
    const task = pdf.getDocument({ data: bytes, useWorkerFetch: false, useSystemFonts: true });
    try {
      const document = await task.promise;
      const texts: string[] = [];
      for (let n = 1; n <= document.numPages; n++) {
        const reader = (await document.getPage(n)).streamTextContent().getReader();
        let text = '';
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            text += chunk.value.items.map((item: { str?: string }) => item.str ?? '').join('');
          }
        } finally { reader.releaseLock(); }
        texts.push(text);
      }
      const workerModule = await import(/* @vite-ignore */ workerUrl);
      return { texts, workers, handler: typeof workerModule.WorkerMessageHandler.setup };
    } finally { await task.destroy(); globalThis.Worker = BaseWorker; }
  });
  expect(result.texts).toHaveLength(3);
  expect(result.texts[2]).toContain('Page 3 gamma keyword');
  expect(result.workers).toHaveLength(1);
  expect(result.workers[0]?.events).toContain('GetDoc');
  expect(result.workers[0]?.events).toContain('DataLoaded');
  expect(result.handler).toBe('function');
});
