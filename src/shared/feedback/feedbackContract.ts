export const FEEDBACK_LIMITS = {
  attachmentCount: 3,
  attachmentSizeBytes: 3 * 1024 * 1024,
  contactLength: 160,
  messageLength: 4000,
  nameLength: 80
} as const;

export const FEEDBACK_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type FeedbackImageType = (typeof FEEDBACK_IMAGE_TYPES)[number];

export interface FeedbackAttachmentPayload {
  contentBase64: string;
  name: string;
  size: number;
  type: string;
}

export interface FeedbackMetadataPayload {
  appVersion?: string;
  language?: string;
  platform?: string;
  submittedAt?: string;
}

export interface FeedbackSubmissionPayload {
  attachments?: FeedbackAttachmentPayload[];
  contact?: string;
  honeypot?: string;
  message?: string;
  metadata?: FeedbackMetadataPayload;
  name?: string;
  turnstileToken?: string;
}

export type FeedbackValidationResult =
  | { ok: true; value: NormalizedFeedbackSubmission }
  | { errors: string[]; ok: false };

export interface NormalizedFeedbackSubmission {
  attachments: FeedbackAttachmentPayload[];
  contact: string;
  honeypot: string;
  message: string;
  metadata: FeedbackMetadataPayload;
  name: string;
  turnstileToken: string;
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isAllowedImageType(value: string): value is FeedbackImageType {
  return FEEDBACK_IMAGE_TYPES.includes(value as FeedbackImageType);
}

function validateAttachment(value: unknown, index: number, errors: string[]) {
  if (!value || typeof value !== 'object') {
    errors.push(`attachment_${index}_invalid`);
    return null;
  }
  const attachment = value as Partial<FeedbackAttachmentPayload>;
  const type = typeof attachment.type === 'string' ? attachment.type : '';
  const size = typeof attachment.size === 'number' ? attachment.size : 0;
  const contentBase64 = typeof attachment.contentBase64 === 'string' ? attachment.contentBase64 : '';
  if (!isAllowedImageType(type)) {
    errors.push(`attachment_${index}_type`);
  }
  if (!Number.isFinite(size) || size <= 0 || size > FEEDBACK_LIMITS.attachmentSizeBytes) {
    errors.push(`attachment_${index}_size`);
  }
  if (!contentBase64) {
    errors.push(`attachment_${index}_content`);
  }
  return {
    contentBase64,
    name: normalizeText(attachment.name, 120) || `feedback-image-${index + 1}`,
    size,
    type
  };
}

function normalizeAttachments(value: unknown, errors: string[]) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push('attachments_invalid');
    return [];
  }
  if (value.length > FEEDBACK_LIMITS.attachmentCount) {
    errors.push('attachments_count');
  }
  return value
    .slice(0, FEEDBACK_LIMITS.attachmentCount)
    .map((attachment, index) => validateAttachment(attachment, index, errors))
    .filter((attachment): attachment is FeedbackAttachmentPayload => attachment !== null);
}

function normalizeMetadata(value: unknown): FeedbackMetadataPayload {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const metadata = value as FeedbackMetadataPayload;
  return {
    ...(typeof metadata.appVersion === 'string' ? { appVersion: metadata.appVersion.slice(0, 40) } : {}),
    ...(typeof metadata.language === 'string' ? { language: metadata.language.slice(0, 40) } : {}),
    ...(typeof metadata.platform === 'string' ? { platform: metadata.platform.slice(0, 40) } : {}),
    ...(typeof metadata.submittedAt === 'string' ? { submittedAt: metadata.submittedAt.slice(0, 40) } : {})
  };
}

export function validateFeedbackSubmission(input: unknown): FeedbackValidationResult {
  const errors: string[] = [];
  const payload = input && typeof input === 'object' ? input as Partial<FeedbackSubmissionPayload> : {};
  const message = normalizeText(payload.message, FEEDBACK_LIMITS.messageLength);
  if (!message) {
    errors.push('message_required');
  }
  if (typeof payload.message === 'string' && payload.message.trim().length > FEEDBACK_LIMITS.messageLength) {
    errors.push('message_too_long');
  }
  const attachments = normalizeAttachments(payload.attachments, errors);
  const value: NormalizedFeedbackSubmission = {
    attachments,
    contact: normalizeText(payload.contact, FEEDBACK_LIMITS.contactLength),
    honeypot: normalizeText(payload.honeypot, 200),
    message,
    metadata: normalizeMetadata(payload.metadata),
    name: normalizeText(payload.name, FEEDBACK_LIMITS.nameLength),
    turnstileToken: normalizeText(payload.turnstileToken, 2048)
  };
  return errors.length ? { errors, ok: false } : { ok: true, value };
}
