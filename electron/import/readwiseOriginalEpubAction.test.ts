// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildDocument: vi.fn(),
  captureSnapshot: vi.fn(),
  commit: vi.fn(),
  download: vi.fn(),
  fetchRemote: vi.fn(),
  isReady: vi.fn(),
  loadTarget: vi.fn(),
  prepare: vi.fn(),
  readStatus: vi.fn()
}));

vi.mock('../attachments/managedAttachmentFileStage.js', () => ({
  cleanCreatedManagedAttachmentFiles: vi.fn()
}));
vi.mock('./readwiseApiOriginalFile.js', () => ({ downloadReadwiseOriginalFile: mocks.download }));
vi.mock('./readwiseOriginalEpubAnnotations.js', () => ({
  buildLocalReadwiseOriginalEpubDocument: mocks.buildDocument
}));
vi.mock('./readwiseOriginalEpubCommit.js', () => ({ commitReadwiseOriginalEpub: mocks.commit }));
vi.mock('./readwiseOriginalEpubPreparation.js', () => ({ prepareOriginalEpubCandidate: mocks.prepare }));
vi.mock('./readwiseOriginalEpubRemote.js', () => ({ fetchOriginalEpubRemoteRoot: mocks.fetchRemote }));
vi.mock('./readwiseOriginalEpubTarget.js', () => ({
  captureReadwiseOriginalEpubSnapshot: mocks.captureSnapshot,
  isReadwiseOriginalEpubRuntimeReady: mocks.isReady,
  loadReadwiseOriginalEpubTarget: mocks.loadTarget,
  readReadwiseOriginalEpubRuntimeStatus: mocks.readStatus
}));

import {
  loadReadwiseOriginalEpubActionState,
  useReadwiseOriginalEpub
} from './readwiseOriginalEpubAction.js';

const target = {
  connectionRef: 'connection',
  documentId: 'document',
  nodeId: 'book',
  sourceFingerprint: 'fingerprint',
  state: { bodyAuthority: 'original_epub' },
  title: 'Book'
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.loadTarget.mockReturnValue(target);
  mocks.readStatus.mockReturnValue('ready');
  mocks.isReady.mockReturnValue(true);
  mocks.captureSnapshot.mockReturnValue('snapshot');
  mocks.fetchRemote.mockResolvedValue({ rawSourceUrl: 'https://example.s3.amazonaws.com/book.epub' });
  mocks.download.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.prepare.mockResolvedValue({ stages: [] });
  mocks.buildDocument.mockReturnValue({ id: 'document' });
});

it('keeps an existing original EPUB book ready for another rebuild', () => {
  expect(loadReadwiseOriginalEpubActionState('book')).toEqual({ node_id: 'book', status: 'ready' });
});

it('runs the existing EPUB pipeline again on every confirmed request', async () => {
  await expect(useReadwiseOriginalEpub('book')).resolves.toMatchObject({ status: 'completed' });
  await expect(useReadwiseOriginalEpub('book')).resolves.toMatchObject({ status: 'completed' });

  expect(mocks.fetchRemote).toHaveBeenCalledTimes(2);
  expect(mocks.download).toHaveBeenCalledTimes(2);
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.commit).toHaveBeenCalledTimes(2);
});
