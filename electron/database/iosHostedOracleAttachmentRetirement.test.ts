// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { loadIosAcceptanceContractCorpus } from '../../scripts/ios/ios-acceptance-contract-corpus.js';
import { createHostedPackTaskSource } from '../../scripts/ios/ios-hosted-sync-pack-task-source.js';

it('adapts immutable legacy oracle attachments into node-owned resources and preserves PDF relationships', async () => {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-oracle-retirement-'));
  const corpus = loadIosAcceptanceContractCorpus();
  const source = await createHostedPackTaskSource({ artifactRoot,
    oraclePackPath: corpus.contentResourcePack, sourceName: 'resources' });
  try {
    expect(source.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_blobs'").get()).toBeUndefined();
    const id = corpus.contentResource.attachments.valid.hash;
    expect(source.sqlite.prepare(`SELECT json_extract(resource.value, '$.storage_key') AS storage_key
      FROM nodes owner, json_each(owner.resource_references) resource`).all())
      .toEqual([{ storage_key: `${id}.pdf` }]);
    expect(source.sqlite.prepare('SELECT text FROM pdf_page_text WHERE attachment_id = ?').get(id))
      .toEqual({ text: 'Extracted pdf-cobalt-token' });
    expect(source.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments')").all())
      .toEqual([]);
  } finally {
    source.close();
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
});
