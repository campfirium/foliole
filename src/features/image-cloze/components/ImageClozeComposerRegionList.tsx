import { AppButton, AppEmptyState, AppInput } from '../../../shared/ui';
import type { ImageClozeDraftRegion } from '../model/imageCloze';

interface ImageClozeComposerRegionListProps {
  onRegionAnswerChange: (regionId: string, answer: string) => void;
  onRegionRemove: (regionId: string) => void;
  regions: ImageClozeDraftRegion[];
}

function renderEmptyState() {
  return <AppEmptyState description="No region yet. Draw on the image to add one." title="No regions" />;
}

function renderRegionCard(
  region: ImageClozeDraftRegion,
  index: number,
  onRegionRemove: (regionId: string) => void,
  onRegionAnswerChange: (regionId: string, answer: string) => void
) {
  return (
    <div className="rounded-md border border-border bg-bg-canvas px-3 py-3" key={region.id}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">Region {index + 1}</span>
        <AppButton onClick={() => onRegionRemove(region.id)} size="sm" type="button" variant="ghost">
          Remove
        </AppButton>
      </div>
      <AppInput
        className="mt-2"
        onChange={(event) => onRegionAnswerChange(region.id, event.target.value)}
        placeholder="Answer"
        value={region.answer}
      />
    </div>
  );
}

export function ImageClozeComposerRegionList({
  onRegionAnswerChange,
  onRegionRemove,
  regions
}: ImageClozeComposerRegionListProps) {
  if (regions.length === 0) {
    return renderEmptyState();
  }

  return regions.map((region, index) => renderRegionCard(region, index, onRegionRemove, onRegionAnswerChange));
}
