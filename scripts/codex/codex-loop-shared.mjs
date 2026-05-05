export const EXHAUSTED_REPAIR_CODE = 'QUALITY_GATE_REPAIR_EXHAUSTED';

export function normalizeFailureMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function buildFailureSignature(error) {
  const firstLine = normalizeFailureMessage(error)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0];
  return (firstLine ?? 'unknown failure').slice(0, 200);
}

export function buildRepairTask(task, reason) {
  const normalizedTask = task || 'reconcile current workspace';
  return [
    `Repair the current workspace for task: ${normalizedTask}.`,
    'Focus only on the existing uncommitted changes left by the previous loop iteration.',
    'Fix quality-gate failures and keep the task boundary unchanged.',
    `Failure context: ${reason}`
  ].join(' ');
}

export function buildNextRoundTask(task, reason) {
  const normalizedTask = task || 'reconcile current workspace';
  return [
    `Continue repairing task: ${normalizedTask}.`,
    'The previous conversation exhausted its repair budget.',
    'Work only from the current uncommitted workspace and keep the same task boundary.',
    `Failure context: ${reason}`
  ].join(' ');
}

export function createExhaustedRepairError(task, round, signature, error, conversationLimit, repairAttemptLimit) {
  const normalizedTask = task || 'unknown task';
  const normalizedSignature = signature || buildFailureSignature(error);
  const normalizedReason = normalizeFailureMessage(error);
  const summary = [
    'quality-gate repair exhausted',
    `task: ${normalizedTask}`,
    `round: ${round}/${conversationLimit}`,
    `repair-attempt-limit: ${repairAttemptLimit}`,
    `failure-signature: ${normalizedSignature}`,
    `last-error: ${normalizedReason}`
  ].join('\n');
  const failure = new Error(summary);
  failure.code = EXHAUSTED_REPAIR_CODE;
  return failure;
}
