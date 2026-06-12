import { X } from 'lucide-react';

import {
  FEEDBACK_IMAGE_TYPES,
  type FeedbackAttachmentPayload
} from '../../shared/feedback/feedbackContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

export function FeedbackAttachmentPicker(props: {
  attachments: FeedbackAttachmentPayload[];
  onAppendFiles: (files: File[]) => Promise<void>;
  onRemoveAttachment: (index: number) => void;
}) {
  const t = useTranslation();
  return (
    <section className="py-3 font-shellless-ui">
      <div className="flex min-h-8 flex-wrap items-center justify-start gap-3">
        <label className="cursor-pointer text-shellless-meta text-shellless-control-fg transition-colors hover:text-shellless-fg">
          {t('feedback.attachments.add')}
          <input
            accept={FEEDBACK_IMAGE_TYPES.join(',')}
            className="sr-only"
            multiple
            onChange={(event) => void props.onAppendFiles(Array.from(event.target.files ?? []))}
            type="file"
          />
        </label>
      </div>
      {props.attachments.length ? (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {props.attachments.map((attachment, index) => (
            <FeedbackAttachmentPreview
              attachment={attachment}
              index={index}
              key={`${attachment.name}-${index}`}
              onRemoveAttachment={props.onRemoveAttachment}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FeedbackAttachmentPreview(props: {
  attachment: FeedbackAttachmentPayload;
  index: number;
  onRemoveAttachment: (index: number) => void;
}) {
  const t = useTranslation();
  return (
    <div className="group relative w-28 shrink-0 overflow-hidden rounded-shellless-control border border-shellless-control-border bg-shellless-surface">
      <img
        alt={props.attachment.name}
        className="h-[4.5rem] w-full object-cover"
        src={`data:${props.attachment.type};base64,${props.attachment.contentBase64}`}
      />
      <div className="px-2 py-1.5">
        <span className="min-w-0 truncate text-xs text-shellless-muted">{props.attachment.name}</span>
      </div>
      <button
        aria-label={t('feedback.attachments.remove', { name: props.attachment.name })}
        className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-shellless-control border border-shellless-control-border bg-shellless-surface/90 text-shellless-muted shadow-control hover:bg-shellless-surface hover:text-shellless-fg"
        onClick={() => props.onRemoveAttachment(props.index)}
        type="button"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
