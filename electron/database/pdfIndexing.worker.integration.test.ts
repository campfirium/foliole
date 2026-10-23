// @vitest-environment node
import './pdfIndexingTestSupport.js';

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

vi.mock('node:worker_threads', async (original) => {
  const native = await original<typeof import('node:worker_threads')>();
  return { ...native, Worker: class extends native.Worker {
    constructor(url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(new URL(url.href.replace(/\.js$/, '.ts')), { ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types'] });
    }
  } };
});

import { resolveAttachmentFile } from '../attachments/resourceResolver.js';

import { openDatabaseConnection, runWithDatabaseConnectionOwner } from './connection.js';
import { enqueuePdfAttachmentIndexing, markPdfAttachmentIndexPending } from './pdfIndexing.js';
import { pdfId } from './pdfIndexingTestSupport.js';

const PAGE_COUNT = 400;

/** A plain text PDF whose parse takes long enough to show whether the main thread is held. */
function longTextPdf(pageCount: number) {
  const objects = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const pagesId = 2 + pageCount * 2;
  const kids: number[] = [];
  for (let page = 0; page < pageCount; page += 1) {
    const stream = Array.from({ length: 50 }, (_, line) =>
      `BT /F1 9 Tf 40 ${780 - line * 15} Td (Page ${page} line ${line} the quick brown fox jumps over the lazy dog) Tj ET`).join('\n');
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objects.push(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${objects.length} 0 R `
      + '/Resources << /Font << /F1 1 0 R >> >> >>');
    kids.push(objects.length);
  }
  objects.push(`<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  objects.push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  return `${body}trailer\n<< /Size ${objects.length + 1} /Root ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

async function mountPdf(bytes: Buffer) {
  const fixture = await resolveAttachmentFile(`${pdfId}.pdf`);
  if (fixture.status !== 'ready') throw new Error('PDF fixture is not mounted');
  const attachmentId = createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(path.dirname(fixture.filePath), `${attachmentId}.pdf`), bytes);
  const reference = JSON.stringify([{ storage_key: `${attachmentId}.pdf`, original_name: 'long.pdf', role: 'reference' }]);
  await runWithDatabaseConnectionOwner(() => {
    openDatabaseConnection().driver.execute(`INSERT INTO nodes (id, title, resource_references, created_at, updated_at)
      VALUES ('long-pdf-topic', 'Long PDF', ?, '2026-10-24', '2026-10-24')`, [reference]);
    markPdfAttachmentIndexPending(attachmentId);
  });
  return attachmentId;
}

function readIndex(attachmentId: string) {
  return runWithDatabaseConnectionOwner(() => {
    const { driver } = openDatabaseConnection();
    return {
      pages: driver.queryAll<{ text: string }>('SELECT text FROM pdf_page_text WHERE attachment_id = ? ORDER BY page', [attachmentId]),
      state: driver.queryOne('SELECT status, attempt, error FROM pdf_index_state WHERE attachment_id = ?', [attachmentId])
    };
  });
}

it('indexes a long PDF while the main thread keeps handling events', async () => {
  vi.stubEnv('VITEST', '');
  const attachmentId = await mountPdf(Buffer.from(longTextPdf(PAGE_COUNT), 'latin1'));
  let longestTurnGapMs = 0;
  let lastTurnAt = performance.now();
  let observing = true;
  const turn = () => {
    if (!observing) return;
    const now = performance.now();
    longestTurnGapMs = Math.max(longestTurnGapMs, now - lastTurnAt);
    lastTurnAt = now;
    setImmediate(turn);
  };
  setImmediate(turn);

  try {
    enqueuePdfAttachmentIndexing(attachmentId);
    await vi.waitFor(async () => expect((await readIndex(attachmentId)).state)
      .toEqual({ status: 'ready', attempt: 1, error: null }), { timeout: 60_000, interval: 20 });
  } finally {
    observing = false;
    vi.unstubAllEnvs();
  }

  const { pages } = await readIndex(attachmentId);
  expect(pages).toHaveLength(PAGE_COUNT);
  expect(pages[PAGE_COUNT - 1]?.text).toContain(`Page ${PAGE_COUNT - 1} line 0`);
  expect(longestTurnGapMs).toBeLessThan(100);
}, 120_000);
