import { X } from 'lucide-react';

import type { NativeAssistantImageDraft } from '../../../lib/platform/nativeAssistantImageContract';
import { AppIconButton } from '../../shared/ui';

import { assistantImageDataUrl } from './workspaceRightSidebarAssistantImages';

export function WorkspaceRightSidebarAssistantImageStrip(props: {
  images: NativeAssistantImageDraft[];
  onRemove?: (index: number) => void;
  removeLabel?: string;
}) {
  if (!props.images.length) return null;
  return (
    <div className="flex min-w-0 gap-2 overflow-x-auto py-1" data-testid="assistant-image-strip">
      {props.images.map((image, index) => (
        <div className="group relative size-16 shrink-0 overflow-hidden rounded-md border border-border bg-foreground/[0.035]" key={`${image.originalName}-${index}`}>
          <img
            alt={image.originalName}
            className="size-full object-cover"
            src={assistantImageDataUrl(image)}
          />
          {props.onRemove && props.removeLabel ? (
            <AppIconButton
              className="absolute right-0.5 top-0.5 size-6 rounded-full bg-canvas/90 text-foreground shadow-sm"
              icon={<X aria-hidden className="size-3.5" strokeWidth={1.8} />}
              label={`${props.removeLabel}: ${image.originalName}`}
              onClick={() => props.onRemove?.(index)}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
