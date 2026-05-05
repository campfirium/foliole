import { AppEmptyState } from '../../../shared/ui';
import { MarkdownEditor } from '../../editor/components/MarkdownEditor';
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
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <ImageClozePromptSection node={node} />
        {resourceState === 'ready' && resourceUrl ? (
          <ImageClozeRegionSurface
            hiddenRegionIds={showAnswer ? [] : ['current']}
            imageAlt={node.title || 'Image cloze'}
            imageSrc={resourceUrl}
            outlinedRegionIds={showAnswer ? ['current'] : []}
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

function ImageClozePromptSection({ node }: { node: Node }) {
  if (!node.content.trim()) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-panel">
      <div className="px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Prompt</div>
      <div className="min-h-[140px] border-t border-border">
        <MarkdownEditor
          ariaLabel="Image cloze prompt"
          className="prompt-editor-host min-h-[140px]"
          hideTitleHeading={false}
          nodeId={`${node.id}-image-cloze-prompt`}
          onChange={() => undefined}
          readOnly
          value={node.content}
        />
      </div>
    </section>
  );
}

function ImageClozeAnswerSection({
  node,
  onAnswerChange,
  showAnswer
}: Pick<ImageClozeCardViewProps, 'node' | 'onAnswerChange' | 'showAnswer'>) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-panel">
      <div className="px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Answer</div>
      {showAnswer ? (
        <div className="min-h-[220px] border-t border-border">
          <MarkdownEditor
            ariaLabel="Image cloze answer"
            className="answer-editor-host min-h-[220px]"
            hideTitleHeading={false}
            nodeId={`${node.id}-image-cloze-answer`}
            onChange={onAnswerChange}
            value={node.reveal ?? ''}
          />
        </div>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground">Reveal the answer to see the hidden region content.</p>
      )}
    </section>
  );
}
