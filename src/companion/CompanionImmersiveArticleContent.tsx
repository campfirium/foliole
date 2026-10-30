import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';
import { definedProps } from '../shared/lib/definedProps';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import type { CompanionReadableArticle as ReadableArticle } from '../shared/platform/companionReadableArticle';

import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import type { CompanionReadingActivity } from './companionReadingActivity';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';

export function ImmersiveArticleContent(props: {
  onAttachmentResourceSynced?: () => void;
  activity?: CompanionReadingActivity;
  answer?: string | null;
  isReviewItem?: boolean;
  isContentEditing: boolean;
  layout?: 'article' | 'review';
  onEditorReady(adapter: EditorAdapter | null): void;
  onSaveArticleContent?: CompanionContentSaveHandler;
  readableArticle: ReadableArticle;
  readingTypographySettings: CompanionReadingTypographySettings;
  readingRestoreCommandId: string | null;
  readingSelection: EditorSelection | null;
  syncEndpointUrl?: string | null;
}) {
  return (
    <div className={`${props.isContentEditing && props.isReviewItem && props.answer != null ? 'companion-item-edit-content' : ''} mx-auto w-full max-w-[760px] ${props.layout === 'review' ? '' : 'flex-1'}`}>
      <ReadableArticleDocument
        allowContentEditing={props.isContentEditing}
        layout={props.layout ?? 'article'}
        onEditorReady={props.onEditorReady}
        readableArticle={props.readableArticle}
        readingTypographySettings={props.readingTypographySettings}
        readingRestoreCommandId={props.readingRestoreCommandId}
        readingSelection={props.readingSelection}
        scrollContainer="outer"
        {...definedProps({
          activity: props.activity, answer: props.answer, isReviewItem: props.isReviewItem,
          onAttachmentResourceSynced: props.onAttachmentResourceSynced,
          onSaveContent: props.onSaveArticleContent,
          syncEndpointUrl: props.syncEndpointUrl
        })}
      />
    </div>
  );
}
