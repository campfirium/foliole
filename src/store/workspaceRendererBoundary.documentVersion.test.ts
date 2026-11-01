import { afterEach, expect, it } from 'vitest';

import { markNodeContentEdited, resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import { mergeWorkspaceNodeDocument } from './workspaceRendererBoundaryDocument';

const oldTime = '2026-10-31T00:00:00.000Z';
const newTime = '2026-10-31T00:01:00.000Z';
const metadata = { id: 'article', content: '', hasContent: true, reveal: null,
  currentVersionId: 'old-version', updatedAt: oldTime };
const document = { content: 'Fresh imported body', currentVersionId: 'new-version',
  hideTitleHeading: false, kind: 'topic' as const, reveal: null, updatedAt: newTime };

afterEach(resetNodeContentVersionGuardForTests);

it('loads body, version and timestamp together when list metadata predates the document', () => {
  expect(mergeWorkspaceNodeDocument(metadata, document)).toMatchObject({
    content: document.content, currentVersionId: document.currentVersionId, updatedAt: newTime
  });
});

it('keeps an unconfirmed draft paired with its original version and timestamp', () => {
  markNodeContentEdited(metadata.id);
  const draft = { ...metadata, content: 'Unsaved local body' };
  expect(mergeWorkspaceNodeDocument(draft, document)).toMatchObject({
    content: draft.content, currentVersionId: metadata.currentVersionId, updatedAt: oldTime
  });
});

it('keeps the loaded body and version when an older document arrives', () => {
  const current = { ...metadata, content: document.content, currentVersionId: document.currentVersionId, updatedAt: newTime };
  expect(mergeWorkspaceNodeDocument(current, { ...document, content: 'Old body',
    currentVersionId: metadata.currentVersionId, updatedAt: oldTime })).toMatchObject({
    content: current.content, currentVersionId: current.currentVersionId, updatedAt: newTime
  });
});
