import type { WorkspaceNodeSnapshot } from '../../../../lib/core/database/workspaceSnapshotHelpers';

import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from './imageCloze';

export function imageClozeNodeFields(attachmentId: string, source: ImageClozeSourcePayload, regions: ImageClozeDraftRegion[]) {
  const primary = regions[0];
  if (!primary) throw new Error('image_cloze_region_required');
  return {
    kind: 'item' as const,
    content: source.promptContent,
    reveal: source.revealContent,
    anchorLink: {
      id: primary.id, kind: 'cloze' as const,
      locator: { attachmentId, height: primary.height, width: primary.width, x: primary.x, y: primary.y }
    },
    imageRegions: [{ attachmentId, regions: regions.map(({ id, height, width, x, y }) => ({ id, height, width, x, y })) }]
  } satisfies Partial<WorkspaceNodeSnapshot>;
}
