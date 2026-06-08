import { ImagePlus, X } from 'lucide-react';
import { useMemo } from 'react';

import {
  FEEDBACK_IMAGE_TYPES,
  FEEDBACK_LIMITS,
  type FeedbackAttachmentPayload
} from '../../shared/feedback/feedbackContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

export function FeedbackAttachmentPicker(props: {
  attachments: FeedbackAttachmentPayload[];
  onAppendFiles: (files: File[]) => Promise<void>;
  onRemoveAttachment: (index: number) => void;
}) {
  const t = useTranslation();
  const attachmentLabel = useMemo(() => `${props.attachments.length}/${FEEDBACK_LIMITS.attachmentCount}`, [props.attachments.length]);
  return (
    <section className="py-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2 text-sm text-foreground/60">
          <p className="text-sm font-medium text-foreground">{t('feedback.attachments.title')}</p>
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs tabular-nums text-foreground/60">
            {t('feedback.attachments.count', { count: attachmentLabel })}
          </span>
          <span>{t('feedback.attachments.hint')}</span>
        </div>
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2.5 text-sm text-foreground hover:bg-foreground/[0.03]">
          <ImagePlus aria-hidden className="size-4" />
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
    <div className="group relative w-28 shrink-0 overflow-hidden rounded-md border border-border bg-background">
      <img
        alt={props.attachment.name}
        className="h-[4.5rem] w-full object-cover"
        src={`data:${props.attachment.type};base64,${props.attachment.contentBase64}`}
      />
      <div className="px-2 py-1.5">
        <span className="min-w-0 truncate text-xs text-foreground/70">{props.attachment.name}</span>
      </div>
      <button
        aria-label={t('feedback.attachments.remove', { name: props.attachment.name })}
        className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-foreground/65 shadow-sm hover:bg-background hover:text-foreground"
        onClick={() => props.onRemoveAttachment(props.index)}
        type="button"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
