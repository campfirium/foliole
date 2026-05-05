import type { AnchorMutationProjectionInput } from './anchorMutationProjection.js';
import { projectAnchorMutation } from './anchorMutationProjection.js';
import {
  collectAnchorProtectedRanges,
  doesChangeTouchAnchorProtectedRanges,
  type AnchorRange,
  type AnchorRangeChange
} from './anchorRecords.js';

export interface AnchorMutationDecisionAllow {
  kind: 'allow';
}

export interface AnchorMutationDecisionBlock {
  kind: 'block';
}

export interface AnchorMutationDecisionRewrite {
  content: string;
  kind: 'rewrite';
  selection: { anchor: number; head: number };
}

export type AnchorMutationDecision =
  | AnchorMutationDecisionAllow
  | AnchorMutationDecisionBlock
  | AnchorMutationDecisionRewrite;

export function shouldBlockAnchorTagMutation(content: string, changes: AnchorRangeChange[]): boolean {
  if (changes.length === 0) {
    return false;
  }

  const protectedRanges = collectAnchorProtectedRanges(content);
  if (protectedRanges.length === 0) {
    return false;
  }

  return doesChangeTouchAnchorProtectedRanges(changes, protectedRanges);
}

export function collectProtectedTagRanges(content: string): AnchorRange[] {
  return collectAnchorProtectedRanges(content);
}

export function resolveAnchorMutationDecision(input: AnchorMutationProjectionInput): AnchorMutationDecision {
  const rewritten = projectAnchorMutation(input);
  if (rewritten) {
    return {
      content: rewritten.content,
      kind: 'rewrite',
      selection: rewritten.selection
    };
  }

  if (shouldBlockAnchorTagMutation(input.content, input.changes)) {
    return { kind: 'block' };
  }

  return { kind: 'allow' };
}
