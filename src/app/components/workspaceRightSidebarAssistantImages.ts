import {
  NATIVE_ASSISTANT_IMAGE_LIMITS,
  NATIVE_ASSISTANT_IMAGE_MIME_TYPES,
  type NativeAssistantImageDraft,
  type NativeAssistantImageMimeType
} from '../../../lib/platform/nativeAssistantImageContract';

export type AssistantImageDraftError = 'count' | 'read' | 'size' | 'type';

export async function appendAssistantImageFiles(
  current: NativeAssistantImageDraft[],
  files: readonly File[]
) {
  if (current.length + files.length > NATIVE_ASSISTANT_IMAGE_LIMITS.count)
    return { error: 'count' as const, images: current };
  const images = [...current];
  for (const file of files) {
    const mimeType = normalizeMimeType(file.type);
    if (!mimeType) return { error: 'type' as const, images: current };
    if (!file.size || file.size > NATIVE_ASSISTANT_IMAGE_LIMITS.sizeBytes)
      return { error: 'size' as const, images: current };
    try {
      const contentBase64 = await readFileBase64(file);
      if (!images.some((image) => image.contentBase64 === contentBase64)) images.push({
        contentBase64,
        mimeType,
        originalName: file.name,
        sizeBytes: file.size
      });
    } catch {
      return { error: 'read' as const, images: current };
    }
  }
  return { error: null, images };
}

export function assistantImageDataUrl(image: NativeAssistantImageDraft) {
  return `data:${image.mimeType};base64,${image.contentBase64}`;
}

function normalizeMimeType(value: string): NativeAssistantImageMimeType | null {
  const normalized = value.trim().toLowerCase() as NativeAssistantImageMimeType;
  return NATIVE_ASSISTANT_IMAGE_MIME_TYPES.includes(normalized) ? normalized : null;
}

function readFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('assistant_image_read_failed'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      if (separator < 0) reject(new Error('assistant_image_read_failed'));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}
