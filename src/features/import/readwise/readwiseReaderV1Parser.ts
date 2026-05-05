export const READWISE_READER_V1_SUPPORTED_INPUT_SHAPES = [
  'article_full',
  'article_highlights',
  'book_highlights'
] as const;

export type ReadwiseReaderV1InputShape =
  (typeof READWISE_READER_V1_SUPPORTED_INPUT_SHAPES)[number];

export interface ReadwiseReaderV1Highlight {
  highlightedAt: string | null;
  id: string;
  location: number | null;
  locationType: string | null;
  note: string | null;
  text: string;
}

export interface ReadwiseReaderV1Document {
  author: string | null;
  content: string | null;
  contentHtml: string | null;
  highlights: ReadwiseReaderV1Highlight[];
  id: string;
  inputShape: ReadwiseReaderV1InputShape;
  siteName: string | null;
  sourceKind: 'article' | 'book';
  sourceUrl: string | null;
  title: string;
  updatedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseHighlight(value: unknown): ReadwiseReaderV1Highlight | null {
  const record = asRecord(value);
  const id = asNonEmptyString(record?.id);
  const text = asNonEmptyString(record?.text);
  if (!record || !id || !text) {
    return null;
  }
  return {
    highlightedAt: asNonEmptyString(record.highlighted_at),
    id,
    location: asNullableNumber(record.location),
    locationType: asNonEmptyString(record.location_type),
    note: asNonEmptyString(record.note),
    text
  };
}

function parseHighlights(value: unknown): ReadwiseReaderV1Highlight[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => parseHighlight(item))
    .filter((item): item is ReadwiseReaderV1Highlight => item !== null);
}

function resolveInputShape(
  sourceKind: ReadwiseReaderV1Document['sourceKind'],
  content: string | null,
  contentHtml: string | null,
  highlights: ReadwiseReaderV1Highlight[]
): ReadwiseReaderV1InputShape | null {
  if (sourceKind === 'book' && highlights.length > 0) {
    return 'book_highlights';
  }
  if (sourceKind !== 'article') {
    return null;
  }
  if (content || contentHtml) {
    return 'article_full';
  }
  if (highlights.length > 0) {
    return 'article_highlights';
  }
  return null;
}

export function parseReadwiseReaderV1Document(value: unknown): ReadwiseReaderV1Document | null {
  const record = asRecord(value);
  const id = asNonEmptyString(record?.id);
  const title = asNonEmptyString(record?.title);
  const category = asNonEmptyString(record?.category);
  if (!record || !id || !title || (category !== 'article' && category !== 'book')) {
    return null;
  }

  const content = asNonEmptyString(record.content);
  const contentHtml = asNonEmptyString(record.content_html);
  const highlights = parseHighlights(record.highlights);
  const inputShape = resolveInputShape(category, content, contentHtml, highlights);
  if (!inputShape) {
    return null;
  }

  return {
    author: asNonEmptyString(record.author),
    content,
    contentHtml,
    highlights,
    id,
    inputShape,
    siteName: asNonEmptyString(record.site_name),
    sourceKind: category,
    sourceUrl: asNonEmptyString(record.source_url),
    title,
    updatedAt: asNonEmptyString(record.updated_at)
  };
}
