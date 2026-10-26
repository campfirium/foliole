import { loadReviewTrainingInput, loadReviewTrainingPlan, saveReviewTrainingModel } from '../../../shared/platform/runtime/reviewTrainingRuntimeRepository';

import { runReviewTrainingWorker } from './reviewTrainingWorkerClient';

const isForeground = () => document.visibilityState !== 'hidden';
let state = { running: false, studyActive: false, lastTrainedAt: null as string | null, error: false, revision: 0 };
const listeners = new Set<() => void>();
function update(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
export const getReviewTrainingSession = () => state;
export function subscribeReviewTrainingSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setReviewTrainingStudyActive(studyActive: boolean) { update({ studyActive }); }
export function refreshReviewTrainingParameters() { update({ revision: state.revision + 1 }); }

export async function refreshReviewTrainingStatus() {
  const plan = await loadReviewTrainingPlan();
  update({ lastTrainedAt: plan.lastTrainedAt });
  return plan;
}

export async function optimizeReadyReviewFolders() {
  if (state.running || state.studyActive || !isForeground()) return;
  update({ running: true, error: false });
  try {
    const plan = await refreshReviewTrainingStatus();
    for (const folder of plan.folders) {
      if (state.studyActive || !isForeground()) break;
      const input = await loadReviewTrainingInput(folder.folderId, plan.libraryScope);
      // Fixed input and a fresh Worker per folder release wasm memory between training runs.
      const model = await runReviewTrainingWorker(input);
      await saveReviewTrainingModel(model, plan.libraryScope);
      update({ lastTrainedAt: model.trainedAt, revision: state.revision + 1 });
    }
  } catch (error) {
    update({ error: true });
    throw error;
  } finally { update({ running: false }); }
}
