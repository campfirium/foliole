import { z } from 'zod';

const pageSchema = z.object({
  results: z.array(z.unknown()),
  nextPageCursor: z.union([
    z.string().min(1),
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).transform(String),
    z.null()
  ])
});

export function createReadwiseApiPageParser(initialCursor: string | null = null) {
  const seen = new Set(initialCursor === null ? [] : [initialCursor]);
  return (payload: unknown) => {
    const parsed = pageSchema.safeParse(payload);
    if (!parsed.success) throw new Error('readwise_api_page_invalid');
    const { results, nextPageCursor: cursor } = parsed.data;
    if (cursor !== null) {
      if (seen.has(cursor)) throw new Error('readwise_api_cursor_cycle');
      seen.add(cursor);
    }
    return { results, cursor };
  };
}
