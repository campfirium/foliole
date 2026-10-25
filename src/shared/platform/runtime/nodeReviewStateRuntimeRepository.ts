import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeSaveNodeReviewStateArgs } from '../../../../lib/platform/nativeNodeReviewStateContract';
import { toNodeReviewProfile } from '../../../features/review/model/reviewTypes';
import { getRuntimeInvoke } from '../runtimeInvoke';
import { logRuntimeError } from '../runtimeLogging';

export async function saveNodeReviewStateToRuntime(payload: NativeSaveNodeReviewStateArgs) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return false;
  try {
    const card = await runtimeInvoke(NATIVE_COMMANDS.saveNodeReviewState, payload);
    return { review: card ? toNodeReviewProfile(card) : null };
  } catch (error) {
    logRuntimeError('node review state save failed', {
      area: 'persistence', action: 'save_node_review_state', fallback: 'keep_previous_review_state',
      error, nodeId: payload.nodeId
    });
    return false;
  }
}
