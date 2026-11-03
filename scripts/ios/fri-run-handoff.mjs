import { describeFriFailure } from './fri-xctest-diagnosis.mjs';

const FEEDBACK_VALUES = {
  prompt: ['handled', 'none', 'pending'],
  app: ['opened', 'startup-failed', 'ready'],
  lock: ['locked', 'unlocked']
};

function retainFeedback(recovery, feedback) {
  const retained = { ...recovery.feedback };
  for (const [key, value] of Object.entries(feedback ?? {})) {
    if (key === 'detail' && typeof value === 'string' && value.trim()) retained.detail = value;
    else if (FEEDBACK_VALUES[key]?.includes(value)) retained[key] = value;
    else throw new Error(`Invalid Fri feedback: ${key}`);
  }
  recovery.feedback = retained;
  return retained;
}

function promptAction(recovery, feedback, failure) {
  if (feedback.prompt === 'pending') return 'await-user';
  if (feedback.lock === 'locked') return 'wait-until-available';
  if (feedback.prompt || recovery.promptAsked) return 'do-not-ask';
  if (failure.diagnosis.methodsStarted.length ||
      !failure.diagnosis.failures.some(({ kind }) =>
        kind === 'automation-startup' || kind === 'unknown')) return 'do-not-ask';
  // A timeout never proves a prompt. This is only the one permitted observation question.
  recovery.promptAsked = true;
  return 'ask-once-if-prompt-visible';
}

export function consumeFriHandoff(result = {}, { recovery = {}, feedback } = {}) {
  const output = result.output ?? `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const locks = [...output.matchAll(/passcodeRequired:\s*(true|false)/gu)];
  if (locks.length) {
    recovery.feedback = { ...recovery.feedback,
      lock: locks.at(-1)[1] === 'true' ? 'locked' : 'unlocked' };
  }
  const retained = retainFeedback(recovery, feedback);
  const failure = describeFriFailure(result);
  const { diagnosis } = failure;
  const status = diagnosis.statuses ?? {};
  const hasMethod = diagnosis.methodsStarted.length > 0;
  const observed = {
    invocationId: failure.invocationId,
    diagnosticComplete: failure.diagnosticComplete,
    exitCode: result.code ?? result.status ?? null,
    interrupted: failure.terminationReason,
    automation: hasMethod ? 'method-started' : 'method-not-observed',
    foreground: status.keepStatus === 0 ? 'restored' : status.keepStatus > 0 ? 'failed' : 'unverified',
    app: retained.app ?? 'unverified',
    assertions: hasMethod && diagnosis.failures.some(({ kind }) => kind === 'test-failure') ? 'failed' :
      hasMethod && diagnosis.testResult === 'Passed' && !diagnosis.failures.length &&
      status.xcodeStatus === 0 && failure.diagnosticComplete && !failure.terminationReason ? 'passed' : 'unverified',
    failures: diagnosis.failures
  };
  const hasResult = Object.keys(result).length > 0;
  const handoff = { ...(hasResult ? observed : recovery.latest ?? observed),
    app: retained.app ?? 'unverified', promptAction: promptAction(recovery, retained, failure) };
  recovery.latest = handoff;
  return handoff;
}
