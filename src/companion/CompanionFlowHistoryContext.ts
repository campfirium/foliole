import { createContext, useContext } from 'react';

import type { HistoryMode } from '../store/workspaceReviewHistoryTarget';

export type CompanionFlowHistoryControls = {
  refreshPending: boolean;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  apply(mode: HistoryMode): void;
};
export const CompanionFlowHistoryContext = createContext<CompanionFlowHistoryControls | null>(null);
export const useCompanionFlowHistoryControls = () => useContext(CompanionFlowHistoryContext);
