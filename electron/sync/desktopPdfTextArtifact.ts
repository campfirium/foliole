import { promises as fs } from 'node:fs';
import path from 'node:path';

import { exportPdfTextArtifact } from '../../lib/core/sync/pdfTextArtifact.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';

export async function createDesktopPdfTextArtifact(host: RequestSyncDatabaseHost, assetsDir: string, key: string, version: number) {
  if (!/^[a-f0-9]{64}\.pdf$/u.test(key)) throw new Error('pdf_text_source_invalid');
  const artifact = await host.readSnapshot(db => exportPdfTextArtifact(db, key.slice(0, 64), version));
  if (!artifact) return null;
  const target = path.join(assetsDir, artifact.storageKey);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, artifact.text, { flag: 'wx' });
    await fs.rename(temporary, target);
  } finally { await fs.rm(temporary, { force: true }); }
  return artifact.storageKey;
}
