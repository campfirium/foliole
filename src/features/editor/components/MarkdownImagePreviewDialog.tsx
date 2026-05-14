import { X } from 'lucide-react';

import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppIconButton } from '../../../shared/ui';
import type { MarkdownImagePreviewRequest } from '../model/markdownImagePreview';

function resolveRegionState(props: { hiddenRegionIds: Set<string>; outlinedRegionIds: Set<string>; regionId: string }) {
  if (props.hiddenRegionIds.has(props.regionId)) {
    return 'hidden';
  }
  if (props.outlinedRegionIds.has(props.regionId)) {
    return 'outlined';
  }
  return 'normal';
}

interface MarkdownImagePreviewDialogProps {
  image: MarkdownImagePreviewRequest | null;
  onOpenChange: (open: boolean) => void;
}

function renderPreviewImage(
  image: MarkdownImagePreviewRequest,
  hiddenRegionIds: Set<string>,
  outlinedRegionIds: Set<string>
) {
  return (
    <div
      className="relative inline-flex max-h-full max-w-full items-center justify-center"
      onClick={(event) => event.stopPropagation()}
    >
      <img alt={image.alt || 'Image preview'} className="block max-h-[88vh] max-w-[88vw] object-contain" src={image.src} />
      {image.presentation?.regions?.length ? (
        <div aria-hidden="true" className="cm-md-image-cloze-regions z-local-raised">
          {image.presentation.regions.map((region) => (
            <div
              className="cm-md-image-cloze-region"
              data-region-id={region.id}
              data-region-state={resolveRegionState({ hiddenRegionIds, outlinedRegionIds, regionId: region.id })}
              key={region.id}
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MarkdownImagePreviewDialog(props: MarkdownImagePreviewDialogProps) {
  const hiddenRegionIds = new Set(props.image?.presentation?.hiddenRegionIds ?? []);
  const outlinedRegionIds = new Set(props.image?.presentation?.outlinedRegionIds ?? []);
  const handleDismiss = () => props.onOpenChange(false);

  return (
    <AppDialog onOpenChange={props.onOpenChange} open={Boolean(props.image)}>
      <AppDialogPortal>
        <AppDialogOverlay className="bg-[var(--app-floating-overlay-bg)]" />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-4 top-4 right-4 bottom-4 z-preview-dialog max-w-none translate-x-0 translate-y-0 overflow-visible border-transparent bg-transparent p-0 shadow-none"
        >
          <AppDialogTitle className="sr-only">Image preview</AppDialogTitle>
          <div
            className="relative flex h-full w-full cursor-zoom-out items-center justify-center p-0"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                handleDismiss();
              }
            }}
          >
            <div className="absolute right-4 top-4 z-local-raised">
              <AppIconButton
                className="bg-bg-elevated/92 text-foreground hover:bg-bg-elevated"
                icon={<X aria-hidden="true" size={16} strokeWidth={2} />}
                label="Close image preview"
                onClick={handleDismiss}
              />
            </div>
            {props.image ? renderPreviewImage(props.image, hiddenRegionIds, outlinedRegionIds) : null}
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
