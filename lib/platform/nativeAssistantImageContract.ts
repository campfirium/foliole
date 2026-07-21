export const NATIVE_ASSISTANT_IMAGE_LIMITS = {
  count: 3,
  sizeBytes: 3 * 1024 * 1024
} as const;

export const NATIVE_ASSISTANT_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp'
] as const;

export type NativeAssistantImageMimeType =
  (typeof NATIVE_ASSISTANT_IMAGE_MIME_TYPES)[number];

export interface NativeAssistantImageDraft {
  contentBase64: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}

export interface NativeAssistantImageAttachment {
  id: string;
  mimeType: NativeAssistantImageMimeType;
  originalName: string;
  sizeBytes: number;
}

export type NativeAssistantImageContentResult =
  | {
      attachmentId: string;
      contentBase64: string;
      mimeType: NativeAssistantImageMimeType;
      status: 'ready';
    }
  | {
      attachmentId: string;
      status: 'missing_file' | 'not_found';
    };
