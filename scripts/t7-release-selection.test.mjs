// @vitest-environment node

import fs from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(fs.readFileSync('.github/workflows/t7-release.yml', 'utf8'));
const assembly = parse(fs.readFileSync('.github/workflows/release-assembly.yml', 'utf8'));
const platforms = ['macos', 'windows', 'linux', 'ios', 'android'];
const scopes = Array.from({ length: (1 << platforms.length) - 1 }, (_, index) =>
  platforms.filter((_, bit) => (index + 1) & (1 << bit)));

function context(scope, stage = '', event = 'push') {
  return {
    github: { event_name: event }, inputs: { stage },
    needs: {
      release_context: { result: 'success', outputs: {
        release_scope: scope.join(','), release_scope_json: JSON.stringify(scope)
      } },
      release_candidate: { result: stage && stage !== 'full' ? 'skipped' : 'success' },
      ...Object.fromEntries(platforms.map(platform => [`${platform}_package`, {
        result: scope.includes(platform) ? 'success' : 'skipped'
      }]))
    }
  };
}

// Evaluate the actual YAML conditions, including GitHub's implicit success() default.
// This tests selection logic locally; hosted scheduling remains a separate evidence boundary.
function enabled(expression = 'true', values, cancelled = false) {
  const body = expression.replace(/^\$\{\{\s*|\s*\}\}$/gu, '');
  const success = () => !cancelled && Object.values(values.needs ?? {})
    .every(job => job.result === 'success');
  if (!/\b(?:always|cancelled|success|failure)\(/u.test(body) && !success()) return false;
  return Boolean(runInNewContext(body, {
    ...values, always: () => true, cancelled: () => cancelled, success,
    contains: (items, item) => items.includes(item), fromJSON: JSON.parse
  }));
}

describe('selected release packaging', () => {
  it.each(scopes.map(scope => [scope]))('runs only %s for push, full and assembly', scope => {
    for (const [stage, event] of [['', 'push'], ['full', 'workflow_dispatch'],
      ['assembly', 'workflow_dispatch']]) {
      const values = context(scope, stage, event);
      for (const platform of platforms) {
        expect(enabled(workflow.jobs[`${platform}_package`].if, values), `${stage}:${platform}`)
          .toBe(scope.includes(platform));
      }
      expect(enabled(workflow.jobs.assemble_draft.if, values)).toBe(true);
    }
  });

  it.each(scopes.map(scope => [scope]))('narrow rechecks respect %s and never assemble', scope => {
    for (const stage of platforms.filter(id => workflow.on.workflow_dispatch.inputs.stage.options.includes(id))) {
      const values = context(scope, stage, 'workflow_dispatch');
      for (const platform of platforms) {
        expect(enabled(workflow.jobs[`${platform}_package`].if, values))
          .toBe(platform === stage && scope.includes(platform));
      }
      expect(enabled(workflow.jobs.assemble_draft.if, values)).toBe(false);
    }
  });

  it.each(['failure', 'cancelled', 'skipped', ''])('rejects selected producer state %s', result => {
    for (const scope of scopes) {
      for (const platform of scope) {
        const values = context(scope);
        values.needs[`${platform}_package`].result = result;
        expect(enabled(workflow.jobs.assemble_draft.if, values)).toBe(false);
      }
    }
  });

  it('does not accept an unexpected producer outside the frozen scope', () => {
    for (const result of ['success', 'failure', 'cancelled', '']) {
      const values = context(['windows']);
      values.needs.macos_package.result = result;
      expect(enabled(workflow.jobs.assemble_draft.if, values)).toBe(false);
    }
  });

  it('blocks producer jobs after failed identity, quality or candidate checks and cancellation', () => {
    for (const platform of platforms) {
      const job = workflow.jobs[`${platform}_package`];
      for (const stage of ['', 'full']) {
        const values = context(platforms, stage);
        values.needs.release_candidate.result = 'failure';
        expect(enabled(job.if, values)).toBe(false);
      }
      const values = context(platforms);
      values.needs.release_context.result = 'failure';
      expect(enabled(job.if, values)).toBe(false);
      expect(enabled(workflow.jobs.assemble_draft.if, values)).toBe(false);
      expect(enabled(job.if, context(platforms), true)).toBe(false);
      expect(enabled(workflow.jobs.assemble_draft.if, context(platforms), true)).toBe(false);
    }
  });

  it.each(scopes.map(scope => [scope]))('downloads only the frozen %s same-run artifacts', scope => {
    const values = { steps: { identity: { outputs: {
      release_scope_json: JSON.stringify(scope), release_scope: scope.join(',')
    } } } };
    const downloads = assembly.jobs.assemble.steps.filter(step => step.uses?.startsWith('actions/download-artifact@'));
    const paths = downloads.filter(step => enabled(step.if, values)).map(step => step.with.path);
    expect(paths.sort()).toEqual(scope.map(platform => `release-assets/${platform}`).sort());
    for (const step of downloads) {
      expect(step.with['run-id']).toBeUndefined();
      expect(step.with.repository).toBeUndefined();
    }
  });
});
