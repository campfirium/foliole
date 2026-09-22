import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createStoredSyncState } from '../../companionWorkspaceSync.testSupport';

const mocks = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn() }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: mocks.read })
}));

import { readCompanionArticle } from './companionArticleRead';
import { CompanionReadingSnapshotChanged } from './companionReadingDemand';
import { invalidateCompanionReadingScope } from './companionReadingScope';

function snapshot() {
  const result = createStoredSyncState().workspace_snapshot!;
  result.nodesById['node-1']!.currentVersionId = 'v1';
  result.nodesById['node-1']!.content = '';
  return result;
}
function document(version = 'v1') {
  return { id: 'node-1', current_version_id: version, body_blob_hash: null,
    content: 'Current body', content_status: 'ready', pdf_attachment_id: null, reveal: null, title: 'Current title' };
}

describe('consistent companion body reading', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.read.mockReset().mockImplementation((task: (db: DbPort) => Promise<unknown>) =>
      task({ query: mocks.query } as unknown as DbPort));
  });

  it('reads body, its own version and annotations inside one owner operation', async () => {
    const source = snapshot();
    const anchor = { id: 'anchor-1', kind: 'highlight' as const, locator: { from: 0, to: 7, originalText: 'Current' } };
    source.nodesById.note = { ...source.nodesById['node-1']!, id: 'note', parentNodeId: 'node-1',
      kind: 'item', currentVersionId: 'note-v1', anchorLink: anchor };
    mocks.query.mockResolvedValueOnce([document()]).mockResolvedValueOnce([
      { id: 'note', current_version_id: 'note-v1', body_blob_hash: null, anchor_link: JSON.stringify(anchor), content: 'Note body' }
    ]);
    const article = await readCompanionArticle(source, 'node-1', () => true);
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(article).toMatchObject({ content: 'Current body', currentVersionId: 'v1', loadedNodeContentById: { note: 'Note body' } });
  });

  it('does not label a newer body with the old catalog version', async () => {
    mocks.query.mockResolvedValueOnce([document('v2')]).mockResolvedValueOnce([]);
    await expect(readCompanionArticle(snapshot(), 'node-1', () => true)).rejects.toBeInstanceOf(CompanionReadingSnapshotChanged);
  });

  it('rejects annotations added since the catalog even if the parent version is unchanged', async () => {
    mocks.query.mockResolvedValueOnce([document()]).mockResolvedValueOnce([
      { id: 'new-note', current_version_id: 'note-v1', body_blob_hash: null, anchor_link: '{}', content: 'New note' }
    ]);
    await expect(readCompanionArticle(snapshot(), 'node-1', () => true)).rejects.toBeInstanceOf(CompanionReadingSnapshotChanged);
  });

  it('does not query an obsolete request queued behind another owner operation', async () => {
    await expect(readCompanionArticle(snapshot(), 'node-1', () => false)).resolves.toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('discards a read when the database lifetime changes while it is running', async () => {
    mocks.query.mockImplementationOnce(async () => { invalidateCompanionReadingScope(); return [document()]; })
      .mockResolvedValueOnce([]);
    await expect(readCompanionArticle(snapshot(), 'node-1', () => true)).resolves.toBeNull();
  });
});
