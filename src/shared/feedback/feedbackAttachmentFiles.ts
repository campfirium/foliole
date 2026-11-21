import { FEEDBACK_IMAGE_TYPES, FEEDBACK_LIMITS, type FeedbackAttachmentPayload } from './feedbackContract';

export async function fileToPayload(file: File): Promise<FeedbackAttachmentPayload> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return {
    contentBase64: window.btoa(binary),
    name: file.name,
    size: file.size,
    type: file.type
  };
}

export function validateFile(file: File) {
  if (!FEEDBACK_IMAGE_TYPES.includes(file.type as never)) {
    return 'type';
  }
  if (file.size > FEEDBACK_LIMITS.attachmentSizeBytes) {
    return 'size';
  }
  return null;
}
