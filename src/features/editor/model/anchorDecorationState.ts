import {
  type AnchorDecorationPlan,
  buildPreviewAnchorDecorationPlan,
  buildSourceModeAnchorDecorationPlan,
  collectAnchorSensitiveRanges
} from './anchorDecorationPlans.js';
import type { AnchorRange, AnchorRangeChange } from './anchorRecords.js';
import { doesRangeTouchRange } from './anchorRecords.js';

export interface AnchorDecorationStatePlan {
  plan: AnchorDecorationPlan;
  sensitiveRanges: AnchorRange[];
}

export interface AnchorDecorationStateBuildInput {
  content: string;
  displayMode: 'preview' | 'source';
  hiddenAnchorKeys?: ReadonlySet<string>;
}

export interface AnchorDecorationStateUpdateInput {
  changes: AnchorRangeChange[];
  insertedTexts: string[];
  sensitiveRanges: ReadonlyArray<AnchorRange>;
}

const ANCHOR_REBUILD_PATTERN = /<\/?(?:highlight|cloze)\b|id="/;

function changeTouchesRanges(changes: ReadonlyArray<AnchorRangeChange>, ranges: ReadonlyArray<AnchorRange>) {
  if (changes.length === 0 || ranges.length === 0) {
    return false;
  }
  return changes.some((change) => ranges.some((range) => doesRangeTouchRange(change, range)));
}

function insertedTextIntroducesAnchorSyntax(insertedTexts: ReadonlyArray<string>) {
  return insertedTexts.some((insertedText) => insertedText.length > 0 && ANCHOR_REBUILD_PATTERN.test(insertedText));
}

export function buildAnchorDecorationStatePlan(input: AnchorDecorationStateBuildInput): AnchorDecorationStatePlan {
  return {
    plan:
      input.displayMode === 'source'
        ? buildSourceModeAnchorDecorationPlan(input.content)
        : buildPreviewAnchorDecorationPlan(input.content, input.hiddenAnchorKeys ?? new Set()),
    sensitiveRanges: collectAnchorSensitiveRanges(input.content)
  };
}

export function shouldRebuildAnchorDecorationState(input: AnchorDecorationStateUpdateInput) {
  return (
    changeTouchesRanges(input.changes, input.sensitiveRanges) ||
    insertedTextIntroducesAnchorSyntax(input.insertedTexts)
  );
}
