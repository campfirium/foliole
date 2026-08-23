import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createIosContentResourceAcceptanceFixture } from './ios-content-resource-acceptance-fixture.ts';
import { createIosStateWritebackAcceptanceFixture } from './ios-state-writeback-acceptance-fixture.ts';
import { createIosSyncPackAcceptanceFixture } from './ios-sync-pack-acceptance-fixture.ts';

const PEER_ID = 'ios-acceptance-contract-peer';
const ROOT = path.resolve('scripts/ios/fixtures/acceptance-contract-corpus');

async function generateSyncPackCorpus() {
  const outputDirectory = path.join(ROOT, 'sync-pack-runtime');
  const fixture = await createIosSyncPackAcceptanceFixture({ outputDirectory, toPeerId: PEER_ID });
  try {
    await fixture.buildSuccessorPack(['special-inbox', 'ios-acceptance-restore']);
  } finally {
    fixture.close();
    await fs.rm(path.join(outputDirectory, 'desktop.sqlite'), { force: true });
  }
}

async function generateStateWritebackCorpus() {
  const outputDirectory = path.join(ROOT, 'state-writeback-runtime');
  const fixture = await createIosStateWritebackAcceptanceFixture({ outputDirectory, toPeerId: PEER_ID });
  try {
    await fixture.buildConfirmationPack(0);
    await fixture.buildConfirmationPack(1);
  } finally {
    fixture.close();
    await fs.rm(path.join(outputDirectory, 'desktop.sqlite'), { force: true });
  }
}

async function generateContentResourceCorpus() {
  await createIosContentResourceAcceptanceFixture({
    outputDirectory: path.join(ROOT, 'content-resource-read'),
    toPeerId: PEER_ID
  });
}

async function writeIdentity() {
  const files = (await listFiles(ROOT)).filter((file) => !file.endsWith('corpus.json'));
  const entries = await Promise.all(files.map(async (file) => {
    const bytes = await fs.readFile(path.join(ROOT, file));
    return [file, createHash('sha256').update(bytes).digest('hex')] as const;
  }));
  await fs.writeFile(path.join(ROOT, 'corpus.json'), `${JSON.stringify({
    files: Object.fromEntries(entries), peer_id: PEER_ID, version: 1
  }, null, 2)}\n`);
}

async function listFiles(root: string, directory = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, directory), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(root, relative) : [relative];
  }));
  return files.flat().sort();
}

await fs.rm(ROOT, { force: true, recursive: true });
await fs.mkdir(ROOT, { recursive: true });
await generateSyncPackCorpus();
await generateStateWritebackCorpus();
await generateContentResourceCorpus();
await writeIdentity();
