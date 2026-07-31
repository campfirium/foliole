export const HOSTED_QUALITY_WORKFLOWS = Object.freeze([
  {
    name: 'T5 Baseline Admission',
    path: '.github/workflows/t5-baseline-admission.yml',
    runTier: 'T5'
  },
  {
    name: 'T6 Hosted Quality',
    path: '.github/workflows/t6-hosted-quality.yml',
    runTier: 'T6'
  },
  {
    name: 'T7 Release Candidate Quality',
    path: '.github/workflows/release-candidate-quality.yml',
    runTier: 'T7'
  },
  {
    name: 'T7 Release Windows',
    path: '.github/workflows/release-windows.yml',
    runTier: 'T7'
  },
  {
    name: 'T7 Release macOS',
    path: '.github/workflows/release-macos.yml',
    runTier: 'T7'
  },
  {
    name: 'T7 Publish Release',
    path: '.github/workflows/publish-release.yml',
    runTier: 'T7'
  }
]);

const POLICY_BY_SELECTOR = new Map(HOSTED_QUALITY_WORKFLOWS.flatMap((policy) => [
  [policy.path, policy],
  [policy.name, policy]
]));

export function resolveActionsHandoffPolicy(workflowSelector) {
  return POLICY_BY_SELECTOR.get(workflowSelector) ?? null;
}

export function buildActionsHandoffIdentity(workflowSelector, run) {
  const policy = resolveActionsHandoffPolicy(workflowSelector);
  const runId = String(run.databaseId);
  if (!policy) {
    return {
      controllerRole: '',
      controllerRunId: '',
      handoffTitle: `Foliole Actions failed: ${run.workflowName}`,
      runTier: 'Actions',
      workflowPath: workflowSelector
    };
  }
  return {
    controllerRole: 'hosted-quality-repair-controller',
    controllerRunId: runId,
    handoffTitle: `Foliole ${policy.runTier} hosted quality repair: run ${runId}`,
    runTier: policy.runTier,
    workflowPath: policy.path
  };
}
