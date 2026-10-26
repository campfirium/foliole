import { describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';

import { createExplicitArticleSnapshot, createNodeRecord } from './companion/reading/companionReadableArticle.testSupport';
import { resolveLoadedCompanionArticle, resolveReadableCompanionArticleByNodeId,
  resolveReadableCompanionTrashArticleByNodeId } from './companionReadableArticle';

describe('companion article projection', () => {
  it.each(['deleted', 'legacy', 'restored', 'invalid'] as const)('preserves %s annotation lifecycle', state => {
    const snapshot: WorkspaceSnapshot = createExplicitArticleSnapshot();
    snapshot.nodesById['node-2'] = createNodeRecord({ id: state === 'invalid' ? 'wrong-id' : 'node-2',
      parentNodeId: 'node-1', anchorLink: { id: 'anchor', kind: 'highlight',
        locator: { from: 9, to: 13, originalText: 'Body' } },
      ...(state === 'deleted' ? { deletedAt: '2026-04-21T10:00:00.000Z' } : {}),
      ...(state === 'restored' ? { deletedAt: null } : {}) });
    if (state === 'legacy' || state === 'restored') snapshot.trashedNodeIds = ['node-2'];
    const expected = state === 'restored' ? [{ from: 9, to: 13, nodeId: 'node-2', kind: 'highlight' }] : [];
    expect(resolveReadableCompanionArticleByNodeId(snapshot, 'node-1')?.textAnchorDecorations).toEqual(expected);
    snapshot.nodesById['node-1']!.deletedAt = '2026-04-21T10:00:00.000Z';
    expect(resolveReadableCompanionArticleByNodeId(snapshot, 'node-1')).toBeNull();
    expect(resolveReadableCompanionTrashArticleByNodeId(snapshot, 'node-1')).toMatchObject({
      isTrashed: true, textAnchorDecorations: expected });
  });

  it('hydrates an article without normalizing unrelated node facts', () => {
    const snapshot: WorkspaceSnapshot = createExplicitArticleSnapshot();
    let unrelatedReads = 0;
    Object.defineProperty(snapshot.nodesById['node-2'], 'deletedAt', {
      get: () => { unrelatedReads += 1; return null; }
    });
    const article = resolveLoadedCompanionArticle(snapshot, {
      id: 'node-1', content: 'Loaded body', title: 'Loaded', content_status: 'ready',
      body_blob_hash: 'body-hash', current_version_id: 'version-1', pdf_attachment_id: 'pdf-1', reveal: null
    });
    expect(article).toMatchObject({ nodeId: 'node-1', content: 'Loaded body',
      bodyBlobHash: 'body-hash', currentVersionId: 'version-1', pdfAttachmentId: 'pdf-1' });
    expect(unrelatedReads).toBe(0);
  });

});
