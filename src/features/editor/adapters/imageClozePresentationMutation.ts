import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

export function prunePresentationRegion(
  presentation: ImageClozeEditorPresentation | null | undefined,
  regionId: string
) {
  if (!presentation) {
    return;
  }
  presentation.regions = presentation.regions.filter((region) => region.id !== regionId);
  presentation.hiddenRegionIds = presentation.hiddenRegionIds.filter((id) => id !== regionId);
  presentation.outlinedRegionIds = presentation.outlinedRegionIds.filter((id) => id !== regionId);
  if (presentation.focusRegionId === regionId) {
    presentation.focusRegionId = null;
  }
}
