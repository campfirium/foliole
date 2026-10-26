import { z } from 'zod';

export const REVIEW_TRAINING_STEP = 1024;
export const REVIEW_MODEL_KEY_PREFIX = 'review_training/';
export const REVIEW_TRAINING_ENGINE = 'fsrs-browser@6.6.0';
export const reviewWeightsSchema = z.array(z.number().finite()).length(21);
const metric = z.object({ logLoss: z.number().finite().nonnegative(), rmse: z.number().finite().nonnegative() }).strict();

export const reviewTrainingModelSchema = z.object({
  folderId: z.string().min(1).nullable(),
  weights: reviewWeightsSchema,
  enabled: z.boolean(),
  reviewCount: z.number().int().min(REVIEW_TRAINING_STEP),
  trainedAt: z.string().datetime(),
  engine: z.literal(REVIEW_TRAINING_ENGINE),
  candidate: metric.nullable(),
  baseline: metric.nullable()
}).strict().refine(model => !model.enabled || Boolean(model.candidate && model.baseline &&
  model.candidate.logLoss < model.baseline.logLoss && model.candidate.rmse < model.baseline.rmse),
'An enabled review model must improve both held-out metrics');

export type ReviewTrainingModel = z.infer<typeof reviewTrainingModelSchema>;
export interface ReviewTrainingNode { id: string; parentId: string | null; kind: string }
export interface ReviewTrainingEvent {
  nodeId: string; opId: string; reviewedAt: string; grade: number; kind: 'review' | 'reset';
}
export interface ReviewTrainingInput {
  folderId: string | null;
  reviewCount: number;
  events: ReviewTrainingEvent[];
  baselineWeights: number[] | null;
  enableShortTerm: boolean;
  libraryScope: string;
}

export function reviewModelKey(folderId: string | null) {
  return `${REVIEW_MODEL_KEY_PREFIX}${folderId === null ? 'global' : `folder/${encodeURIComponent(folderId)}`}`;
}

export function isReviewModelKey(key: string) {
  return key === reviewModelKey(null) || /^review_training\/folder\/[^:/]+$/.test(key);
}

export function resolveReviewWeights(nodeId: string | null, nodes: readonly ReviewTrainingNode[],
  models: readonly ReviewTrainingModel[], includeSelf = true): number[] | undefined {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const modelById = new Map(models.map(model => [model.folderId, model]));
  const seen = new Set<string>();
  let id = includeSelf ? nodeId : (nodeId ? byId.get(nodeId)?.parentId ?? null : null);
  while (id && !seen.has(id)) {
    seen.add(id);
    const node = byId.get(id);
    if (!node) break;
    const model = modelById.get(id);
    if (node.kind === 'folder' && model?.enabled) return model.weights;
    id = node.parentId;
  }
  const global = modelById.get(null);
  return global?.enabled ? global.weights : undefined;
}
