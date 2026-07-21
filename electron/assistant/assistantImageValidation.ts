import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  NATIVE_ASSISTANT_IMAGE_LIMITS,
  NATIVE_ASSISTANT_IMAGE_MIME_TYPES,
  type NativeAssistantImageAttachment,
  type NativeAssistantImageDraft,
  type NativeAssistantImageMimeType
} from '../../lib/platform/nativeAssistantImageContract.js';
import { hasSupportedImageSignature } from '../attachments/imageByteSignature.js';

const EXTENSIONS: Record<NativeAssistantImageMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};
const MAX_ENCODED_IMAGE_LENGTH = Math.ceil(NATIVE_ASSISTANT_IMAGE_LIMITS.sizeBytes / 3) * 4;

export interface ValidatedAssistantImage extends NativeAssistantImageAttachment {
  bytes: Uint8Array;
  extension: string;
}

export function validateAssistantImageDrafts(value: unknown): ValidatedAssistantImage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > NATIVE_ASSISTANT_IMAGE_LIMITS.count)
    throw new Error('invalid_assistant_images');
  return value.map((item, index) => validateAssistantImageDraft(item, index));
}

function validateAssistantImageDraft(value: unknown, index: number): ValidatedAssistantImage {
  if (!value || typeof value !== 'object') throw new Error('invalid_assistant_image');
  const input = value as Partial<NativeAssistantImageDraft>;
  const mimeType = readMimeType(input.mimeType);
  const encoded = readCanonicalBase64(input.contentBase64);
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes !== bytes.byteLength || bytes.byteLength === 0 ||
      bytes.byteLength > NATIVE_ASSISTANT_IMAGE_LIMITS.sizeBytes)
    throw new Error('invalid_assistant_image_size');
  if (!hasSupportedImageSignature(bytes, mimeType)) throw new Error('invalid_assistant_image_signature');
  const originalName = normalizeOriginalName(input.originalName, index, mimeType);
  return {
    bytes,
    extension: EXTENSIONS[mimeType],
    id: createHash('sha256').update(bytes).digest('hex'),
    mimeType,
    originalName,
    sizeBytes: bytes.byteLength
  };
}

function readMimeType(value: unknown): NativeAssistantImageMimeType {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!NATIVE_ASSISTANT_IMAGE_MIME_TYPES.includes(normalized as NativeAssistantImageMimeType))
    throw new Error('invalid_assistant_image_type');
  return normalized as NativeAssistantImageMimeType;
}

function readCanonicalBase64(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > MAX_ENCODED_IMAGE_LENGTH || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value))
    throw new Error('invalid_assistant_image_base64');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw new Error('invalid_assistant_image_base64');
  return value;
}

function normalizeOriginalName(value: unknown, index: number, mimeType: NativeAssistantImageMimeType) {
  const candidate = typeof value === 'string' ? path.basename(value.trim()).slice(0, 120) : '';
  return candidate || `aide-image-${index + 1}${EXTENSIONS[mimeType]}`;
}
