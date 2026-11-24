import { z } from 'zod';

export const superMemoPriorityBoundariesSchema = z.array(z.number().int().min(0).max(100)).length(10)
  .refine(boundaries => boundaries[9] === 100 &&
    boundaries.every((value, index) => index === 0 || value >= boundaries[index - 1]!));
