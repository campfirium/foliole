export const DEV_T6_HANDOFF_POLICY = Object.freeze({
  branch: 'dev',
  name: 'T6 Hosted Quality',
  path: '.github/workflows/t6-hosted-quality.yml',
  runTier: 'T6'
});

export function resolveActionsHandoffPolicy(workflowPath, branch) {
  if (workflowPath !== DEV_T6_HANDOFF_POLICY.path || branch !== DEV_T6_HANDOFF_POLICY.branch) {
    return null;
  }
  return DEV_T6_HANDOFF_POLICY;
}

export function buildActionsHandoffIdentity(workflowPath, run) {
  const policy = resolveActionsHandoffPolicy(workflowPath, run.headBranch);
  if (!policy) return null;
  const runId = String(run.databaseId);
  return {
    controllerRole: 'hosted-quality-repair-controller',
    controllerRunId: runId,
    handoffTitle: `Foliole ${policy.runTier} hosted quality repair: run ${runId}`,
    runTier: policy.runTier,
    workflowPath: policy.path
  };
}
