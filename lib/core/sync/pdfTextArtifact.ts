import { z } from 'zod';

import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort } from './dbPort.js';

export const PDF_TEXT_EXTRACTOR_VERSION = 1;
const pageSchema = z.object({ page: z.number().int().positive(), text: z.string(),
  page_width: z.number().positive().nullable(), page_height: z.number().positive().nullable() });
const artifactSchema = z.object({ pdf: z.string().regex(/^[a-f0-9]{64}$/u), version: z.literal(PDF_TEXT_EXTRACTOR_VERSION),
  pages: z.array(pageSchema) });
export const PDF_TEXT_ARTIFACT_SCHEMA = `CREATE TABLE IF NOT EXISTS pdf_text_artifact (
  pdf_hash TEXT NOT NULL, extractor_version INTEGER NOT NULL, storage_key TEXT NOT NULL,
  PRIMARY KEY(pdf_hash, extractor_version))`;

export async function exportPdfTextArtifact(db: DbPort, pdf: string, version: number) {
  if (version !== PDF_TEXT_EXTRACTOR_VERSION || !/^[a-f0-9]{64}$/u.test(pdf)) return null;
  const [state] = await db.query('SELECT 1 FROM pdf_index_state WHERE attachment_id = ? AND status = ? AND version = ?',
    [pdf, 'ready', version]);
  if (!state) return null;
  const pages = z.array(pageSchema).parse(await db.query(
    'SELECT page, text, page_width, page_height FROM pdf_page_text WHERE attachment_id = ? ORDER BY page', [pdf]));
  const text = JSON.stringify(artifactSchema.parse({ pdf, version, pages }));
  return { text, storageKey: `${hashTextBody(text)}.pdftext` };
}

export async function missingPdfTextArtifacts(db: DbPort, keys: string[]) {
  const pdfs = keys.filter(key => key.endsWith('.pdf'));
  const present = new Set<string>();
  for (let offset = 0; offset < pdfs.length; offset += 64) {
    const batch = pdfs.slice(offset, offset + 64).map(key => key.slice(0, 64));
    const rows = await db.query<{ pdf_hash: string }>(`SELECT pdf_hash FROM pdf_text_artifact
      WHERE extractor_version = ? AND pdf_hash IN (${batch.map(() => '?').join(',')})`, [PDF_TEXT_EXTRACTOR_VERSION, ...batch]);
    for (const row of rows) present.add(row.pdf_hash);
  }
  return pdfs.filter(key => !present.has(key.slice(0, 64)));
}

export async function importPdfTextArtifact(db: DbPort, pdfKey: string, storageKey: string, text: string) {
  const artifact = artifactSchema.parse(JSON.parse(text));
  if (`${hashTextBody(text)}.pdftext` !== storageKey || `${artifact.pdf}.pdf` !== pdfKey ||
      artifact.pages.some((page, index) => page.page !== index + 1)) throw new Error('pdf_text_artifact_invalid');
  await db.transaction(async tx => {
    await tx.run('DELETE FROM pdf_page_text WHERE attachment_id = ?', [artifact.pdf]);
    for (const page of artifact.pages) await tx.run(
      'INSERT INTO pdf_page_text(attachment_id, page, text, page_width, page_height) VALUES (?, ?, ?, ?, ?)',
      [artifact.pdf, page.page, page.text, page.page_width, page.page_height]);
    await tx.run(`INSERT INTO pdf_text_artifact(pdf_hash, extractor_version, storage_key) VALUES (?, ?, ?)
      ON CONFLICT(pdf_hash, extractor_version) DO UPDATE SET storage_key = excluded.storage_key`,
    [artifact.pdf, artifact.version, storageKey]);
  });
}
