import { vi } from 'vitest';

export const SHA = '0123456789abcdef0123456789abcdef01234567';

export function job(overrides = {}) {
  return {
    conclusion: 'success', html_url: 'https://github.test/jobs/7', id: 7,
    name: 'Common quality', status: 'completed', ...overrides
  };
}

export function createRunner({
  authCode = 0, branch = 'dev', dispatchCode = 0, dispatchError = '', activeRuns = [],
  jobSnapshots = [[job()]], localHead = SHA, logCodes = [0],
  runSnapshots = [{ conclusion: 'success', status: 'completed' }]
} = {}) {
  const calls = [];
  let jobsIndex = 0;
  let logsIndex = 0;
  let runsIndex = 0;
  const runner = vi.fn(async (command, args, options = {}) => {
    calls.push({ args, command, options });
    if (command === 'git') return { code: 0, stderr: '',
      stdout: args[0] === 'rev-parse' ? `${localHead}\n` : `${branch}\n` };
    if (args[0] === 'auth') return { code: authCode,
      stderr: authCode ? 'not logged in' : '', stdout: '' };
    if (args[0] === 'repo') return { code: 0, stderr: '', stdout: JSON.stringify({
      defaultBranchRef: { name: 'dev' }, nameWithOwner: 'campfirium/foliole'
    }) };
    if (args[0] === 'api' && args.some((arg) => arg.includes('/runs?branch='))) {
      return { code: 0, stderr: '', stdout: JSON.stringify({ workflow_runs: activeRuns }) };
    }
    if (args[0] === 'api' && args.some((arg) => arg.includes('/dispatches'))) {
      return { code: dispatchCode, stderr: dispatchError, stdout: dispatchCode ? '' : JSON.stringify({
        html_url: 'https://github.test/runs/42', workflow_run_id: 42
      }) };
    }
    if (args[0] === 'api' && args.some((arg) => arg.includes('/actions/runs/42/jobs'))) {
      const snapshot = jobSnapshots[Math.min(jobsIndex, jobSnapshots.length - 1)];
      jobsIndex += 1;
      const pages = Array.isArray(snapshot[0]) ? snapshot : [snapshot];
      return { code: 0, stderr: '', stdout: JSON.stringify(pages.map((jobs) => ({ jobs }))) };
    }
    if (args[0] === 'api' && args.some((arg) => arg.endsWith('/actions/runs/42'))) {
      const snapshot = runSnapshots[Math.min(runsIndex, runSnapshots.length - 1)];
      runsIndex += 1;
      return { code: 0, stderr: '', stdout: JSON.stringify(snapshot) };
    }
    if (args[0] === 'api' && args.some((arg) => arg.includes('/actions/jobs/'))) {
      const code = logCodes[Math.min(logsIndex, logCodes.length - 1)];
      logsIndex += 1;
      return { code, stderr: code ? 'logs not ready' : '', stdout: code ? '' : 'failed log' };
    }
    if (args[0] === 'api') return { code: 0, stderr: '', stdout: `${SHA}\n` };
    return { code: 0, stderr: '', stdout: '' };
  });
  return { calls, runner };
}
