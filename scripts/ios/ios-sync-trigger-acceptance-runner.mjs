function isPassedManualTrigger(result) {
  return result?.status === 'passed' && result.phase === 'trigger-observed' &&
    result.native_runtime === 'ios' && result.trigger_reason === 'manual' &&
    result.durable_result === true && typeof result.run_id === 'string' && result.run_id.length > 0;
}

export function verifySyncTriggerAcceptance(first, second) {
  if (!isPassedManualTrigger(first) || !isPassedManualTrigger(second) ||
      first.previous_result_restored !== false || second.previous_result_restored !== true) {
    throw new Error('iOS sync-trigger native runtime and persistence acceptance evidence is incomplete.');
  }
  return { first, second };
}
