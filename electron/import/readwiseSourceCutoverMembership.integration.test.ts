// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'),
  app_data_dir: appData, app_log_dir: path.join(appData, 'logs')
}) }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { loadReadwiseSourceCutover, writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import type { ReadwiseSourceArtifact } from './readwiseSourceCutoverArtifacts.js';
import { freezeReadwiseSourceCutoverMatching } from './readwiseSourceCutoverFrozenMatching.js';
import { recordReadwiseSourceCutoverLegacyFailures } from './readwiseSourceCutoverJournal.js';
import { matchReadwiseSourceCutover } from './readwiseSourceCutoverMatching.js';

beforeEach(async () => {
  appData = await mkdtemp(path.join(os.tmpdir(), 'foliole-membership-journal-'));
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
});
afterEach(async () => {
  closeDatabaseConnection();
  await rm(appData, { force: true, recursive: true });
});

it('freezes complete ordered unmatched members and restores their reasons and denominator after reopen', () => {
  writeReadwiseSourceCutover({ annotations: [], cohortDocumentIds: ['remote'], completedAt: 'now',
    documents: [], retiredNodeIds: [], sourceHost: 'This Mac', startedAt: 'now',
    status: 'migration-in-progress', phase: 'indexing' });
  const readerDocuments: ReaderDocumentContract[] = [{
    author: null, category: 'article', htmlContent: '<p>Remote</p>', id: 'remote', imageUrl: null,
    notes: null, parentId: null, rawSourceUrl: null, sourceUrl: null, summary: null,
    tags: null, title: 'Remote', updatedAt: null, url: null
  }];
  const documents = prepareReadwiseApiDocuments(readerDocuments, []);
  const artifacts = [artifact('first'), artifact('matched', ['remote']), artifact('last')];
  const matching = matchReadwiseSourceCutover({ artifacts, preparedDocuments: documents, readerDocuments });
  const expectedFailures = [{ nodeId: 'first', reason: 'unmatched' }, { nodeId: 'last', reason: 'unmatched' }];
  recordReadwiseSourceCutoverLegacyFailures(matching.failures);
  const frozen = freezeReadwiseSourceCutoverMatching({ artifacts, documents, matching });
  expect(frozen.failures).toEqual(expectedFailures);
  expect(frozen.legacyTotal).toBe(3);
  expect(frozen.artifactFor('remote')).toBe(artifacts[1]);
  closeDatabaseConnection();
  initializeDatabaseConnection(openDatabaseConnection());
  expect(loadReadwiseSourceCutover()).toMatchObject({ unmatchedLegacy: expectedFailures,
    legacyTotal: 3, legacyMatches: [{ nodeId: 'matched', remoteId: 'remote' }] });
  const resumed = freezeReadwiseSourceCutoverMatching({ artifacts, documents,
    matching: { artifactFor: () => null, failures: [] } });
  expect(resumed.failures).toEqual(expectedFailures);
  expect(resumed.legacyTotal).toBe(3);
  expect([...resumed.matchedDocumentIds]).toEqual(['remote']);
  expect(resumed.artifactFor('remote')).toBe(artifacts[1]);
});

function artifact(id: string, ids: string[] = []): ReadwiseSourceArtifact {
  return { disposition: null, documentIds: new Set(ids), highlightIds: new Set(), latestNodeId: id,
    nodeActive: true, originalUrl: null, raw: '', sourceCategory: 'articles', sourceFingerprint: id, title: id };
}
