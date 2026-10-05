// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

it('compiles Electron workers before running source-loaded tests', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/hosted-quality-electron.yml', 'utf8'));
  const steps = workflow.jobs['electron-tests'].steps;
  const compileIndex = steps.findIndex((step) => step.name === 'Compile Electron workers');
  const testIndex = steps.findIndex((step) => step.name === 'Run canonical Electron bucket');

  expect(compileIndex).toBeGreaterThan(-1);
  expect(steps[compileIndex].run).toBe('npm run electron:compile');
  expect(compileIndex).toBeLessThan(testIndex);
});
