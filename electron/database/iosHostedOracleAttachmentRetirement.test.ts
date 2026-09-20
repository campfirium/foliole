// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { loadIosAcceptanceContractCorpus } from '../../scripts/ios/ios-acceptance-contract-corpus.js';
import { createHostedPackTaskSource } from '../../scripts/ios/ios-hosted-sync-pack-task-source.js';

it('adapts immutable legacy oracle attachments into current metadata and preserves PDF relationships', async () => {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-oracle-retirement-'));
  const corpus = loadIosAcceptanceContractCorpus();
  const source = await createHostedPackTaskSource({ artifactRoot,
    oraclePackPath: corpus.contentResourcePack, sourceName: 'resources' });
  try {
    expect(source.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_blobs'").get()).toBeUndefined();
    const id = corpus.contentResource.attachments.valid.hash;
    expect(source.sqlite.prepare('SELECT id, mime_type FROM attachments WHERE id = ?').get(id))
      .toEqual({ id, mime_type: 'application/pdf' });
    expect(source.sqlite.prepare('SELECT attachment_id FROM node_attachments').all()).toEqual([{ attachment_id: id }]);
    expect(source.sqlite.prepare('SELECT text FROM pdf_page_text WHERE attachment_id = ?').get(id))
      .toEqual({ text: 'Extracted pdf-cobalt-token' });
    expect(source.sqlite.prepare('SELECT COUNT(*) AS count FROM attachments').get()).toEqual({ count: 4 });
  } finally {
    source.close();
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
});
