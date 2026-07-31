// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { verifyWorkflowEvidence } from './release-workflow-evidence.mjs';

const SHA = 'a'.repeat(40);
const WORKFLOW = '.github/workflows/t6-hosted-quality.yml';
const BASE_RUN = {
  conclusion: 'success',
  head_sha: SHA,
  html_url: 'https://github.test/runs/42',
  id: 42,
  path: `${WORKFLOW}@dev`,
  status: 'completed',
  workflow_id: 123
};

function response(payload, { ok = true, status = 200 } = {}) {
  return { json: async () => payload, ok, status };
}

function options(overrides = {}) {
  return {
    fetchImpl: vi.fn().mockResolvedValue(response({ workflow_runs: [BASE_RUN] })),
    repository: 'campfirium/foliole',
    sha: SHA,
    token: 'test-token',
    workflow: WORKFLOW,
    ...overrides
  };
}

describe('release workflow evidence', () => {
  it('queries one workflow once and accepts exact completed success evidence', async () => {
    const input = options();
    await expect(verifyWorkflowEvidence(input)).resolves.toEqual({
      runId: 42,
      sha: SHA,
      url: 'https://github.test/runs/42',
      workflow: WORKFLOW
    });
    expect(input.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = input.fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/actions/workflows/t6-hosted-quality.yml/runs?');
    expect(url.searchParams.get('head_sha')).toBe(SHA);
    expect(url.searchParams.get('status')).toBe('completed');
    expect(request.headers.Authorization).toBe('Bearer test-token');
  });

  it('accepts an explicit run only when its numeric workflow identity matches', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(BASE_RUN));
    await expect(verifyWorkflowEvidence(options({
      fetchImpl,
      runId: '42',
      workflow: '123'
    }))).resolves.toMatchObject({ runId: 42, workflow: '123' });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/actions/runs/42');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing evidence', [], 'No workflow evidence'],
    ['failed evidence', [{ ...BASE_RUN, conclusion: 'failure' }], 'No completed successful'],
    ['wrong workflow', [{ ...BASE_RUN, path: '.github/workflows/other.yml@dev' }], 'identity'],
    ['wrong SHA', [{ ...BASE_RUN, head_sha: 'b'.repeat(40) }], 'SHA']
  ])('rejects %s', async (_label, workflowRuns, message) => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ workflow_runs: workflowRuns }));
    await expect(verifyWorkflowEvidence(options({ fetchImpl }))).rejects.toThrow(message);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['short SHA', { sha: 'abc' }, '40-character'],
    ['wrong workflow identifier', { workflow: 'T6 Hosted Quality' }, 'numeric ID'],
    ['wrong repository', { repository: 'foliole' }, 'owner/name'],
    ['wrong run ID', { runId: 'latest' }, 'positive integer']
  ])('rejects %s before querying GitHub', async (_label, override, message) => {
    const input = options(override);
    await expect(verifyWorkflowEvidence(input)).rejects.toThrow(message);
    expect(input.fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when the API request is rejected', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({}, { ok: false, status: 403 }));
    await expect(verifyWorkflowEvidence(options({ fetchImpl }))).rejects.toThrow('HTTP 403');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
