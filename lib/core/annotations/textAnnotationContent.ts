export const DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX = '※ ';

export function formatHighlightCardContent(input: {
  note?: string | null;
  notePrefix?: string;
  text: string;
}) {
  const text = input.text.replace(/\r\n?/g, '\n').trim();
  const note = input.note?.replace(/\r\n?/g, '\n').trim() ?? '';
  return note ? `${text}\n${input.notePrefix ?? DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX}${note}` : text;
}

export function appendHighlightCardNote(input: {
  content: string;
  note: string;
  notePrefix?: string;
  originalText: string;
}) {
  return formatHighlightCardContent({
    note: input.note,
    ...(input.notePrefix === undefined ? {} : { notePrefix: input.notePrefix }),
    text: input.originalText || input.content
  });
}
