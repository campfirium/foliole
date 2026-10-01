import path from 'node:path';

export const coreSuites = {
  journey: ['electron/database/coreWorkspaceJourney.integration.test.ts'],
  editing: ['electron/database/localContentEdit.test.ts', 'electron/database/parentContentMutation.test.ts'],
  reading: ['electron/database/readingProgress.test.ts', 'electron/database/workspaceSnapshot.readingState.test.ts'],
  review: ['electron/database/reviewMutations.test.ts'],
  search: ['electron/database/workspaceSearch.test.ts', 'electron/database/workspaceSearchSourceConsistency.test.ts',
    'electron/database/workspaceSearch.contract.test.ts', 'electron/database/workspaceSearch.ancestorVisibility.test.ts',
    'electron/database/workspaceSearch.batchIndex.test.ts'],
  import: ['electron/database/importPipeline.test.ts', 'electron/database/importPipeline.deleted-instance.test.ts']
};

export function parseMaintenanceArgs(argv) {
  const options = { scope: 'all', id: `run-${Date.now()}` };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--list') { options.list = true; continue; }
    if (!['--scope', '--id'].includes(key) || !argv[i + 1]) throw new Error(`invalid_argument:${key}`);
    options[key.slice(2)] = argv[++i];
  }
  if (!['all', 'core', 'sync', ...Object.keys(coreSuites)].includes(options.scope)) throw new Error('invalid_scope');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(options.id)) throw new Error('invalid_id');
  return options;
}

export function maintenanceSteps(scope, out) {
  const selected = Object.keys(coreSuites).filter((name) => scope === 'all' || scope === 'core' || scope === name);
  const steps = selected.map((name) => ({
    name, args: ['run', 'test:sqlite:electron', '--', ...coreSuites[name]],
    report: '.tmp/vitest/files.json'
  }));
  if (selected.includes('search')) steps.push({ name: 'search-ui',
    args: ['run', 'test:files', '--', 'src/app/components/SearchPalette.debounce.test.tsx',
      'src/app/components/SearchPalette.aliases.test.tsx', 'src/app/components/SearchPalette.runtime.test.tsx'],
    report: '.tmp/vitest/files.json' });
  if (scope === 'all' || scope === 'sync') steps.push({
    name: 'sync', args: ['run', 'sync:simulate', '--', '--path', 'both', '--seed', '283', '--scale', '1',
      '--out', path.join(out, 'sync')], report: path.join(out, 'sync', 'summary.json')
  });
  return steps;
}

export function maintenanceExitCode(results, sourceStable) {
  return results.length > 0 && results.every((result) => result.exitCode === 0) && sourceStable ? 0 : 1;
}
