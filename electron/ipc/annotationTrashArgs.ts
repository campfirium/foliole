import { z } from 'zod';

import { annotationFactHashSchema as hash, annotationHistoryFactSchema as fact } from '../../lib/platform/annotationHistorySchemas.js';

const common = {
  expectedDeletedAt: z.string().datetime().nullable(),
  parents: z.array(z.object({ nodeId: z.string().min(1), imageRegionsHash: hash }).strict())
};
const schema = z.discriminatedUnion('mode', [
  z.object({ ...common, mode: z.literal('capture'), expectedDeletedAt: z.null() }).strict(),
  z.object({ mode: z.literal('replay'), ...common, nodes: z.array(fact).min(1) }).strict()
]);

export function parseAnnotationTrashGuard(value: unknown, operation: 'delete' | 'restore' = 'delete') {
  const parsed = schema.parse(value);
  if (operation === 'restore' && parsed.mode === 'capture') throw new Error('invalid argument: annotationHistory');
  if (new Set(parsed.parents.map(parent => parent.nodeId)).size !== parsed.parents.length
    || (parsed.mode === 'replay' && new Set(parsed.nodes.map(node => node.nodeId)).size !== parsed.nodes.length)) {
    throw new Error('invalid argument: annotationHistory');
  }
  return parsed;
}
