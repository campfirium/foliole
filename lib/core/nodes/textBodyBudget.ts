export const TEXT_BODY_MAX_BYTES = 1_048_576;

export function utf8ByteLength(content: string) {
  let bytes = 0;
  for (const character of content) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export class TextBodyTooLargeError extends Error {
  constructor(readonly actualBytes: number) {
    super('text_body_too_large');
    this.name = 'TextBodyTooLargeError';
  }
}

export function assertTextBodyWithinBudget(content: string) {
  const bytes = utf8ByteLength(content);
  if (bytes > TEXT_BODY_MAX_BYTES) throw new TextBodyTooLargeError(bytes);
}
