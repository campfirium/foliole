import { z } from 'zod';

export const annotationFactHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const annotationHistoryFactSchema = z.object({
  nodeId: z.string().min(1), parentNodeId: z.string().min(1).nullable(), kind: z.string().min(1),
  contentHash: annotationFactHashSchema, revealHash: annotationFactHashSchema.nullable(),
  anchorHash: annotationFactHashSchema, imageRegionsHash: annotationFactHashSchema
}).strict();
export const annotationTrashReceiptSchema = z.object({
  nodes: z.array(annotationHistoryFactSchema).min(1), deletedAt: z.string().datetime().nullable()
}).strict().refine(value => new Set(value.nodes.map(node => node.nodeId)).size === value.nodes.length);
