import { AppEmptyState } from '../../../shared/ui';
import type { Node } from '../../nodes/model/nodeTypes';
import { getImageClozeLocator } from '../model/imageCloze';

import { ImageClozeRegionSurface } from './ImageClozeRegionSurface';
import { useImageClozeResource } from './useImageClozeResource';

interface ImageClozeCardViewProps {
  node: Node;
  onAnswerChange: (answer: string) => void;
  showAnswer: boolean;
}

export function ImageClozeCardView({ node, onAnswerChange, showAnswer }: ImageClozeCardViewProps) {
  const locator = getImageClozeLocator(node.anchorLink);
  const { resourceState, resourceUrl } = useImageClozeResource(locator?.attachmentId ?? null);

  if (!locator) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <AppEmptyState description="This card does not contain a valid image region." title="Image cloze unavailable" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 pt-4 max-[1080px]:px-2" data-testid="image-cloze-card-view">
      <div className="flex min-h-0 flex-1 flex-col">
        {resourceState === 'ready' && resourceUrl ? (
          <ImageClozeRegionSurface
            hiddenRegionIds={showAnswer ? [] : ['current']}
            imageAlt={node.title || 'Image cloze'}
            imageSrc={resourceUrl}
            regions={[{ ...locator, id: 'current' }]}
          />
        ) : (
          <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border border-border bg-bg-panel">
            <AppEmptyState
              description={resourceState === 'missing' ? 'The source image is missing or unavailable.' : 'Loading image…'}
              title={resourceState === 'missing' ? 'Image unavailable' : 'Preparing image'}
            />
          </div>
        )}
      </div>
      <ImageClozeAnswerSection node={node} onAnswerChange={onAnswerChange} showAnswer={showAnswer} />
    </div>
  );
}

function ImageClozeAnswerSection({
  node,
  onAnswerChange,
  showAnswer
}: Pick<ImageClozeCardViewProps, 'node' | 'onAnswerChange' | 'showAnswer'>) {
  return (
    <section className="rounded-lg border border-border bg-bg-panel px-4 py-4">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Answer</div>
      {showAnswer ? (
        <textarea
          className="mt-2 min-h-24 w-full resize-y rounded-md border border-border bg-bg-canvas px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(event) => onAnswerChange(event.target.value)}
          value={node.reveal ?? ''}
        />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Reveal the answer to see the hidden region content.</p>
      )}
    </section>
  );
}
