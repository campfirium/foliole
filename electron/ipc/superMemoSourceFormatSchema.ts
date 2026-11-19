import { z } from 'zod';

import { isValidSuperMemoReferenceMap, SUPER_MEMO_REFERENCE_FIELDS } from '../../lib/core/import/superMemoReferenceFields.js';

const referenceMap = z.partialRecord(z.enum(SUPER_MEMO_REFERENCE_FIELDS), z.string().max(64))
  .refine(isValidSuperMemoReferenceMap);

export const superMemoSourceFormatSchema = z.object({
  placement: z.enum(['metadata', 'body', 'topic-info', 'content-end']),
  template: z.string().max(4000),
  referenceMap: referenceMap.optional()
}).refine(format => !format.referenceMap || format.placement === 'metadata');
