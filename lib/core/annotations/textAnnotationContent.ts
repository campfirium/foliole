const ANNOTATION_NOTE_SEPARATOR = '\n---\n';

export function formatHighlightCardContent(input: {
  note?: string | null;
  text: string;
}) {
  const text = input.text.replace(/\r\n?/g, '\n').trim();
  const note = input.note?.replace(/\r\n?/g, '\n').trim() ?? '';
  return note ? `${text}${ANNOTATION_NOTE_SEPARATOR}${note}` : text;
}

export function appendHighlightCardNote(input: {
  content: string;
  note: string;
  originalText: string;
}) {
  return formatHighlightCardContent({
    note: input.note,
    text: input.originalText || input.content
  });
}
