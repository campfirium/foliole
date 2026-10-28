import type { CSSProperties } from 'react';

import type { EditorAdapter, EditorContentChangeMeta } from '../features/editor/adapters/EditorAdapter';
import { definedProps } from '../shared/lib/definedProps';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionArticleDocument } from './CompanionArticleDocument';

type Props = {
  answer: string | null;
  editing: boolean;
  nodeId: string;
  style: CSSProperties;
  onChange(value: string, meta?: EditorContentChangeMeta): void;
  onEditorReady(editor: EditorAdapter | null): void;
  onDocumentInput(meta?: EditorContentChangeMeta): void;
  onBlur(): void;
  onMissingResource(id: string): Promise<void>;
};

export function CompanionItemAnswer(props: Props) {
  const t = useTranslation();
  if (!props.editing && !props.answer) return null;
  return <section style={props.style} className="border-t border-companion-divider pt-5">
    <CompanionArticleDocument key={props.editing ? 'editing' : 'reading'} content={props.answer ?? ''} nodeId={props.nodeId + '::answer'}
      ariaLabel={t('companion.review.answer')} layout="review" scrollContainer="outer"
      onMissingAttachmentResource={props.onMissingResource}
      {...definedProps({
        onChange: props.editing ? props.onChange : undefined,
        onEditorReady: props.editing ? props.onEditorReady : undefined,
        onDocumentInput: props.editing ? props.onDocumentInput : undefined,
        onBlurCapture: props.editing ? props.onBlur : undefined
      })} />
  </section>;
}
