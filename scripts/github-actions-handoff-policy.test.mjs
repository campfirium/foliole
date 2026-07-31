import { describe, expect, it } from 'vitest';

import {
  buildActionsHandoffIdentity,
  DEV_T6_HANDOFF_POLICY,
  resolveActionsHandoffPolicy
} from './github-actions-handoff-policy.mjs';

describe('GitHub Actions handoff policy', () => {
  it('declares only the top-level dev T6 workflow as a repair stream', () => {
    expect(DEV_T6_HANDOFF_POLICY).toEqual({
      branch: 'dev',
      name: 'T6 Hosted Quality',
      path: '.github/workflows/t6-hosted-quality.yml',
      runTier: 'T6'
    });
  });

  it('builds the repair identity only from the stable path and dev branch', () => {
    const policy = resolveActionsHandoffPolicy('.github/workflows/t6-hosted-quality.yml', 'dev');
    const identity = buildActionsHandoffIdentity('.github/workflows/t6-hosted-quality.yml', {
      databaseId: 42,
      headBranch: 'dev',
      workflowName: 'T6 Hosted Quality'
    });

    expect(policy?.path).toBe('.github/workflows/t6-hosted-quality.yml');
    expect(identity).toMatchObject({
      controllerRole: 'hosted-quality-repair-controller',
      runTier: 'T6',
      workflowPath: '.github/workflows/t6-hosted-quality.yml'
    });
  });

  it('rejects display-name, release-branch, and T7 selectors', () => {
    const run = {
      databaseId: 43,
      headBranch: 'dev',
      workflowName: 'Other Workflow'
    };

    expect(buildActionsHandoffIdentity('T6 Hosted Quality', run)).toBeNull();
    expect(buildActionsHandoffIdentity('.github/workflows/t6-hosted-quality.yml', {
      ...run,
      headBranch: 'release'
    })).toBeNull();
    expect(buildActionsHandoffIdentity('.github/workflows/t7-release.yml', run)).toBeNull();
  });
});
