import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { IOS_HOSTED_PROVIDER_DEVICE_ID } from '../../lib/platform/iosHostedSyncGroupContract.js';

export const IOS_ACCEPTANCE_DESKTOP_PEER_ID = IOS_HOSTED_PROVIDER_DEVICE_ID;
export const IOS_ACCEPTANCE_CONTRACT_PEER_ID = 'ios-acceptance-contract-peer';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'acceptance-contract-corpus');

interface CorpusIdentity {
  files: Record<string, string>;
  payload_schema_version: number;
  peer_id: string;
  version: number;
}

export function loadIosAcceptanceContractCorpus() {
  const identity = JSON.parse(readFileSync(path.join(ROOT, 'corpus.json'), 'utf8')) as CorpusIdentity;
  if (identity.version !== 2 || identity.payload_schema_version !== 78 ||
      identity.peer_id !== IOS_ACCEPTANCE_CONTRACT_PEER_ID) {
    throw new Error('ios_acceptance_contract_corpus_identity_invalid');
  }
  for (const [relativePath, expectedHash] of Object.entries(identity.files)) {
    const actualHash = createHash('sha256').update(readFileSync(path.join(ROOT, relativePath))).digest('hex');
    if (actualHash !== expectedHash) throw new Error(`ios_acceptance_contract_corpus_hash_mismatch:${relativePath}`);
  }
  return {
    contentResource: contentResourceFixture(path.join(ROOT, 'content-resource-read', 'content-resource.syncpack')),
    contentResourceForPack: (packPath: string) => contentResourceFixture(packPath),
    contentResourcePack: path.join(ROOT, 'content-resource-read', 'content-resource.syncpack'),
    stateInitialPack: path.join(ROOT, 'state-writeback-runtime', 'confirmation-0.syncpack'),
    stateSteadyPack: path.join(ROOT, 'state-writeback-runtime', 'confirmation-1.syncpack'),
    syncPackDirectory: path.join(ROOT, 'sync-pack-runtime')
  };
}

function contentResourceFixture(packPath: string) {
  const attachment = (kind: 'corrupt' | 'failed' | 'missing' | 'valid', bytes: Buffer) => ({
    bytes, hash: sha256(bytes), id: `ios-acceptance-${kind}-attachment`,
    mimeType: kind === 'valid' ? 'application/pdf' : 'image/png'
  });
  const content = (text: string) => {
    const bytes = Buffer.from(text, 'utf8');
    return { bytes, hash: sha256(bytes), mimeType: 'text/markdown' };
  };
  return {
    attachments: {
      corrupt: attachment('corrupt', Buffer.from('expected-corrupt-image')),
      failed: attachment('failed', Buffer.from('expected-failed-image')),
      missing: attachment('missing', Buffer.from('expected-missing-image')),
      valid: attachment('valid', Buffer.from('%PDF-1.4\npdf-cobalt-token\n%%EOF'))
    },
    contentBlobs: {
      corrupt: content('# Corrupt\n\nexpected corrupt body'),
      external: content('# External\n\nexternal-orchid-token'),
      missing: content('# Missing\n\nexpected missing body'),
      topic: content('# Topic\n\ntopic-amber-token')
    },
    packPath
  };
}

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}
