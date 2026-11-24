import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph';
import type { ImageFocusRect } from '../../../../features/editor/model/markdownImageFocus';
import { collectImageMatches } from '../../../../features/editor/model/markdownImageMatches';
import { createMarkdownImageCropEdit, createMarkdownImageFocusEdit } from '../../../../features/editor/model/markdownImageSize';
import { createCompanionUuid } from '../../companionUuid';
import { isNativeCompanionNodeVersionWriteRuntime } from '../../companionWorkspaceRuntimeRepository';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { saveCompanionContentEditWithDb } from './companionContentEditing';

export type CompanionImageRectKind = 'focus' | 'crop';

export interface CompanionImageRectRequest {
  nodeId: string;
  expectedContent: string;
  expectedVersionId: string | null;
  imageRange: { from: number; to: number };
  kind: CompanionImageRectKind;
  rect: ImageFocusRect | null;
  scope: ReturnType<typeof getCompanionReadingScope>;
}

const validRect = (rect: ImageFocusRect) => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
  rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001;

/** Writes focus or crop into this image occurrence's Markdown label, the same contract as the desktop editor. */
export function companionImageRectContent(request: Pick<CompanionImageRectRequest, 'expectedContent' | 'imageRange' | 'kind' | 'rect'>) {
  const { expectedContent: markdown, imageRange } = request;
  const match = collectImageMatches(0, markdown).find(image => image.from === imageRange.from && image.to === imageRange.to);
  if (!match?.attachmentId || !match.source.startsWith('asset://') || match.focusEditable === false ||
    markdown.startsWith('![[', match.from)) throw new Error('image_rect_invalid_source');
  const rect = request.rect && {
    x: Math.max(0, request.rect.x), y: Math.max(0, request.rect.y),
    width: Math.min(request.rect.width, 1 - Math.max(0, request.rect.x)), height: Math.min(request.rect.height, 1 - Math.max(0, request.rect.y))
  };
  if (rect && !validRect(rect)) throw new Error('image_rect_invalid_rect');
  const edit = request.kind === 'focus'
    ? createMarkdownImageFocusEdit({ imageRange, markdown, focus: rect })
    : createMarkdownImageCropEdit({ imageRange, markdown, crop: rect });
  if (!edit) throw new Error('image_rect_invalid_source');
  return `${markdown.slice(0, edit.from)}${edit.insert}${markdown.slice(edit.to)}`;
}

export async function saveCompanionImageRect(request: CompanionImageRectRequest) {
  const assertScope = () => { if (request.scope !== getCompanionReadingScope()) throw new Error('image_rect_library_changed'); };
  assertScope();
  if (!isNativeCompanionNodeVersionWriteRuntime()) throw new Error('content_edit_runtime_unavailable');
  const content = companionImageRectContent(request);
  if (content === request.expectedContent) return null;
  return runCompanionHighValueMutationTask(() => writeIosCompanionDatabase(port => port.transaction(async db => {
    assertScope();
    const current = await loadCurrentSyncNodeRecord(db, request.nodeId, false);
    // A label edit is computed from the content the reader opened; any later version could have moved the image.
    if (!current?.version_id || current.snapshot.deleted_at || current.version_id !== request.expectedVersionId ||
      (current.body_text ?? '') !== request.expectedContent) throw new Error('image_rect_source_changed');
    return saveCompanionContentEditWithDb(db, { nodeId: request.nodeId, content, baseVersionId: current.version_id,
      versionId: createOpaqueVersionRef(createCompanionUuid()), updatedAt: new Date().toISOString() });
  }), { kind: 'business' }), { kind: 'nodes', nodeIds: [request.nodeId] });
}
