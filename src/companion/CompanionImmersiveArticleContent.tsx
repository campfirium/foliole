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
  isContentEditing: boolean;
  onEditorReady(adapter: EditorAdapter | null): void;
  onSaveArticleContent?: CompanionContentSaveHandler;
  readableArticle: ReadableArticle;
  readingTypographySettings: CompanionReadingTypographySettings;
  readingRestoreCommandId: string | null;
  readingSelection: EditorSelection | null;
  syncEndpointUrl?: string | null;
}) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[760px]">
      <ReadableArticleDocument
        allowContentEditing={props.isContentEditing}
        onEditorReady={props.onEditorReady}
        readableArticle={props.readableArticle}
        readingTypographySettings={props.readingTypographySettings}
        readingRestoreCommandId={props.readingRestoreCommandId}
        readingSelection={props.readingSelection}
        scrollContainer="outer"
        {...definedProps({
          activity: props.activity, answer: props.answer,
          onAttachmentResourceSynced: props.onAttachmentResourceSynced,
          onSaveContent: props.onSaveArticleContent,
          syncEndpointUrl: props.syncEndpointUrl
        })}
      />
    </div>
  );
}
