import {
  selectFramedSyncRelationReviewFacts,
  selectFramedSyncRelationReviewFactsWithDbPort,
  type FramedSyncRelationReviewSelectionInput
} from '../../lib/core/sync/framedSyncRelationReviewSelection.js';

export type DesktopFramedSyncRelationReviewSelectionInput =
  FramedSyncRelationReviewSelectionInput;

export const selectDesktopFramedSyncRelationReviewFacts =
  selectFramedSyncRelationReviewFacts;

export const selectDesktopFramedSyncRelationReviewFactsWithDbPort =
  selectFramedSyncRelationReviewFactsWithDbPort;
