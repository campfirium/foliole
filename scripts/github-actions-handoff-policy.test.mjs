import { describe, expect, it } from 'vitest';

import {
  buildActionsHandoffIdentity,
  HOSTED_QUALITY_WORKFLOWS,
  resolveActionsHandoffPolicy
} from './github-actions-handoff-policy.mjs';

describe('GitHub Actions handoff policy', () => {
  it('maps stable workflow paths to every monitored hosted-quality tier', () => {
    expect(HOSTED_QUALITY_WORKFLOWS.map(({ path, runTier }) => [path, runTier])).toEqual([
      ['.github/workflows/t5-baseline-admission.yml', 'T5'],
      ['.github/workflows/t6-hosted-quality.yml', 'T6'],
      ['.github/workflows/release-candidate-quality.yml', 'T7'],
      ['.github/workflows/release-windows.yml', 'T7'],
      ['.github/workflows/release-macos.yml', 'T7'],
      ['.github/workflows/publish-release.yml', 'T7']
    ]);
  });

  it('accepts display names only as compatibility selectors while returning the stable path', () => {
    const policy = resolveActionsHandoffPolicy('T6 Hosted Quality');
    const identity = buildActionsHandoffIdentity('T6 Hosted Quality', {
      databaseId: 42,
      workflowName: 'T6 Hosted Quality'
    });

    expect(policy?.path).toBe('.github/workflows/t6-hosted-quality.yml');
    expect(identity).toMatchObject({
      controllerRole: 'hosted-quality-repair-controller',
      runTier: 'T6',
      workflowPath: '.github/workflows/t6-hosted-quality.yml'
    });
  });

  it('keeps unrelated Actions failures outside hosted-quality controller semantics', () => {
    expect(buildActionsHandoffIdentity('Other Workflow', {
      databaseId: 43,
      workflowName: 'Other Workflow'
    })).toEqual({
      controllerRole: '',
      controllerRunId: '',
      handoffTitle: 'Foliole Actions failed: Other Workflow',
      runTier: 'Actions',
      workflowPath: 'Other Workflow'
    });
  });
});
