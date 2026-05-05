import { useEffect, useMemo, useState } from 'react';

import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppEmptyState } from '../../../shared/ui';
import type { ImageClozeDraftRegion } from '../model/imageCloze';

import { ImageClozeComposerRegionList } from './ImageClozeComposerRegionList';
import { ImageClozeRegionSurface } from './ImageClozeRegionSurface';
import { useImageClozeResource } from './useImageClozeResource';

interface ImageClozeComposerDialogProps {
  attachmentId: string | null;
  onClose: () => void;
  onSave: (regions: ImageClozeDraftRegion[]) => string[];
}

function createDraftRegion(region: ImageClozeDraftRegion): ImageClozeDraftRegion {
  return {
    ...region,
    answer: '',
    id: `region-${crypto.randomUUID()}`
  };
}

function useImageClozeComposerRegions(attachmentId: string | null) {
  const [regions, setRegions] = useState<ImageClozeDraftRegion[]>([]);
  const canSave = useMemo(() => regions.some((region) => region.answer.trim().length > 0), [regions]);

  useEffect(() => {
    setRegions([]);
  }, [attachmentId]);

  return {
    canSave,
    handleRegionAnswerChange(regionId: string, answer: string) {
      setRegions((current) => current.map((entry) => (entry.id === regionId ? { ...entry, answer } : entry)));
    },
    handleRegionCreate(region: Omit<ImageClozeDraftRegion, 'answer' | 'attachmentId' | 'id'>) {
      setRegions((current) => [
        ...current,
        createDraftRegion({ ...region, answer: '', attachmentId: attachmentId ?? '', id: `region-${crypto.randomUUID()}` })
      ]);
    },
    handleRegionRemove(regionId: string) {
      setRegions((current) => current.filter((entry) => entry.id !== regionId));
    },
    handleSave(onSave: (regions: ImageClozeDraftRegion[]) => string[]) {
      if (!canSave) {
        return;
      }
      onSave(regions);
      setRegions([]);
    },
    regions
  };
}

export function ImageClozeComposerDialog({ attachmentId, onClose, onSave }: ImageClozeComposerDialogProps) {
  const { resourceState, resourceUrl } = useImageClozeResource(attachmentId);
  const { canSave, handleRegionAnswerChange, handleRegionCreate, handleRegionRemove, handleSave, regions } =
    useImageClozeComposerRegions(attachmentId);

  return (
    <AppDialog onOpenChange={(open) => (!open ? onClose() : undefined)} open={Boolean(attachmentId)}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label="Close image cloze composer" />
        <AppDialogContent aria-describedby={undefined} className="max-w-5xl">
          <div className="flex items-center justify-between gap-3">
            <AppDialogTitle asChild>
              <h2 className="text-base font-semibold text-foreground">Create image cloze</h2>
            </AppDialogTitle>
            <div className="flex items-center gap-2">
              <AppButton onClick={onClose} type="button" variant="ghost">
                Cancel
              </AppButton>
              <AppButton disabled={!canSave} onClick={() => handleSave(onSave)} type="button">
                Save clozes
              </AppButton>
            </div>
          </div>
          <div className="mt-4 grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <ImageClozeComposerSurface
              onCreateRegion={handleRegionCreate}
              regions={regions}
              resourceState={resourceState}
              resourceUrl={resourceUrl}
            />
            <ImageClozeComposerSidebar
              onRegionAnswerChange={handleRegionAnswerChange}
              onRegionRemove={handleRegionRemove}
              regions={regions}
            />
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function ImageClozeComposerSurface(args: {
  onCreateRegion: (region: Omit<ImageClozeDraftRegion, 'answer' | 'attachmentId' | 'id'>) => void;
  regions: ImageClozeDraftRegion[];
  resourceState: 'idle' | 'missing' | 'ready';
  resourceUrl: string | null;
}) {
  return (
    <div className="min-h-[420px]">
      {args.resourceState === 'ready' && args.resourceUrl ? (
        <ImageClozeRegionSurface
          canDraw
          imageAlt="Image cloze source"
          imageSrc={args.resourceUrl}
          onCreateRegion={args.onCreateRegion}
          regions={args.regions}
        />
      ) : (
        <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-border bg-bg-panel">
          <AppEmptyState
            description={args.resourceState === 'missing' ? 'The image could not be loaded.' : 'Loading image…'}
            title={args.resourceState === 'missing' ? 'Image unavailable' : 'Preparing image'}
          />
        </div>
      )}
    </div>
  );
}

function ImageClozeComposerSidebar(args: {
  onRegionAnswerChange: (regionId: string, answer: string) => void;
  onRegionRemove: (regionId: string) => void;
  regions: ImageClozeDraftRegion[];
}) {
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-lg border border-border bg-bg-panel px-4 py-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Regions</h3>
        <p className="mt-1 text-xs text-muted-foreground">Drag on the image to add a region. Each region becomes one review card.</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        <ImageClozeComposerRegionList
          onRegionAnswerChange={args.onRegionAnswerChange}
          onRegionRemove={args.onRegionRemove}
          regions={args.regions}
        />
      </div>
    </section>
  );
}
