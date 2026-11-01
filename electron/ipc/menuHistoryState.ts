import { z } from 'zod';

export function parseMenuHistoryState(value: unknown) {
  return value === undefined ? undefined : z.object({
    undoTitle: z.string().max(300), redoTitle: z.string().max(300), nativeEditing: z.boolean()
  }).strict().parse(value);
}
