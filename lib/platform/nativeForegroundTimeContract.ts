import { z } from 'zod';

export const foregroundTimeHistoryArgsSchema = z.object({ fromDay: z.string(), toDay: z.string() });
export type ForegroundTimeHistoryArgs = z.infer<typeof foregroundTimeHistoryArgsSchema>;
export interface ForegroundTimeHistory {
  coverageFrom: string;
  days: { day: string; durationMs: number }[];
}
